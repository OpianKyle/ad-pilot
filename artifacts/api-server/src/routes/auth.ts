import { Router, type IRouter, type Request, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import { compare, hash } from "bcryptjs";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import {
  GetCurrentUserResponse,
  GetCsrfTokenResponse,
  LoginAccountBody,
  LoginAccountResponse,
  LogoutAccountResponse,
  RegisterAccountBody,
  RegisterAccountResponse,
} from "@workspace/api-zod";
import {
  createAnonymousSession,
  currentUserForSession,
  getMysqlPool,
  getRequestSession,
  isMysqlConfigured,
  rotateSession,
  verifyCsrf,
} from "../lib/mysql";
import { ensureAdpilotSchema } from "../lib/adpilot-schema";
import { getBusinessAccess, isPlatformOwnerEmail } from "../lib/adpilot-auth";

const router: IRouter = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many attempts. Please wait and try again." },
});

function databaseUnavailable(res: Response): void {
  res.status(503).json({ error: "The MySQL database is not configured or is unavailable." });
}

async function businessStatus(
  businessId: number,
): Promise<"pending" | "active" | "suspended"> {
  const access = await getBusinessAccess(businessId);
  return access.status;
}

function logFailure(req: Request, error: unknown, action: string): void {
  req.log.error({ err: error }, `AdPilot ${action} failed`);
}

function isDuplicateEmail(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ER_DUP_ENTRY"
  );
}

router.get("/auth/csrf", async (req, res): Promise<void> => {
  if (!isMysqlConfigured()) {
    databaseUnavailable(res);
    return;
  }
  try {
    const session = await getRequestSession(req);
    const csrf = session
      ? session.csrfToken
      : await createAnonymousSession(res);
    res.json(GetCsrfTokenResponse.parse({ csrf }));
  } catch (error) {
    logFailure(req, error, "CSRF token request");
    databaseUnavailable(res);
  }
});

router.get("/auth/me", async (req, res): Promise<void> => {
  if (typeof req.cookies?.adpilot_session !== "string") {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (!isMysqlConfigured()) {
    databaseUnavailable(res);
    return;
  }
  try {
    const session = await getRequestSession(req);
    if (!session) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const user = await currentUserForSession(session);
    if (!user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const workspaceStatus = await businessStatus(user.businessId);
    res.json(GetCurrentUserResponse.parse({ user: { ...user, workspaceStatus } }));
  } catch (error) {
    logFailure(req, error, "current-user request");
    databaseUnavailable(res);
  }
});

router.post("/auth/register", authLimiter, async (req, res): Promise<void> => {
  if (!isMysqlConfigured()) {
    databaseUnavailable(res);
    return;
  }
  try {
    await ensureAdpilotSchema();
    const session = await verifyCsrf(req);
    if (!session) {
      res.status(403).json({ error: "Refresh the page and try again." });
      return;
    }
    const parsed = RegisterAccountBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: "Enter a name, business, valid email, and password of at least 12 characters." });
      return;
    }
    const input = {
      ...parsed.data,
      name: parsed.data.name.trim(),
      business: parsed.data.business.trim(),
      email: parsed.data.email.trim().toLowerCase(),
    };
    if (input.name.length < 2 || input.business.length < 2) {
      res.status(422).json({ error: "Name and business must be at least 2 characters." });
      return;
    }
    const passwordHash = await hash(input.password, 12);
    const connection = await getMysqlPool().getConnection();
    let businessId = 0;
    let userId = 0;
    try {
      await connection.beginTransaction();
      const [businessResult] = await connection.execute<ResultSetHeader>(
        "INSERT INTO businesses (name) VALUES (?)",
        [input.business],
      );
      businessId = Number(businessResult.insertId);
      const [userResult] = await connection.execute<ResultSetHeader>(
        "INSERT INTO users (business_id, name, email, password_hash) VALUES (?, ?, ?, ?)",
        [businessId, input.name, input.email, passwordHash],
      );
      userId = Number(userResult.insertId);
      await connection.execute(
        `INSERT INTO adpilot_business_access
          (business_id, status, plan, monthly_generation_limit)
         VALUES (?, 'active', 'Pilot', 30)`,
        [businessId],
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      if (isDuplicateEmail(error)) {
        res.status(409).json({ error: "Email already registered" });
        return;
      }
      throw error;
    } finally {
      connection.release();
    }
    await rotateSession(res, session, userId);
    res.status(201).json(
      RegisterAccountResponse.parse({
        user: {
          id: userId,
          businessId,
          name: input.name,
          email: input.email,
          role: "owner",
          workspaceStatus: "active",
        },
      }),
    );
  } catch (error) {
    logFailure(req, error, "registration");
    databaseUnavailable(res);
  }
});

router.post("/auth/login", authLimiter, async (req, res): Promise<void> => {
  if (!isMysqlConfigured()) {
    databaseUnavailable(res);
    return;
  }
  try {
    const session = await verifyCsrf(req);
    if (!session) {
      res.status(403).json({ error: "Refresh the page and try again." });
      return;
    }
    const parsed = LoginAccountBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: "Enter a valid email and password." });
      return;
    }
    const email = parsed.data.email.trim().toLowerCase();
    const [rows] = await getMysqlPool().execute<
      (RowDataPacket & {
        id: number;
        businessId: number;
        name: string;
        email: string;
        passwordHash: string;
        role: "owner" | "member";
      })[]
    >(
      `SELECT id, business_id AS businessId, name, email,
              password_hash AS passwordHash, role
       FROM users WHERE email = ? LIMIT 1`,
      [email],
    );
    const row = rows[0];
    const storedHash = row?.passwordHash?.replace(/^\$2y\$/, "$2a$");
    const passwordIsValid =
      Boolean(row && storedHash) &&
      (await compare(parsed.data.password, storedHash));
    if (!row || !passwordIsValid) {
      res.status(401).json({ error: "Invalid email or password." });
      return;
    }
    const workspaceStatus = await businessStatus(Number(row.businessId));
    if (workspaceStatus === "suspended" && !isPlatformOwnerEmail(row.email)) {
      res.status(403).json({
        error: "This workspace is suspended. Contact the service owner.",
      });
      return;
    }
    const user = {
      id: Number(row.id),
      businessId: Number(row.businessId),
      name: row.name,
      email: row.email,
      role: row.role,
      workspaceStatus,
    };
    await rotateSession(res, session, user.id);
    res.json(LoginAccountResponse.parse({ user }));
  } catch (error) {
    logFailure(req, error, "login");
    databaseUnavailable(res);
  }
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  if (!isMysqlConfigured()) {
    databaseUnavailable(res);
    return;
  }
  try {
    const session = await verifyCsrf(req);
    if (!session) {
      res.status(403).json({ error: "Refresh the page and try again." });
      return;
    }
    await getMysqlPool().execute(
      "DELETE FROM adpilot_sessions WHERE session_id = ?",
      [session.sessionId],
    );
    await createAnonymousSession(res, session.csrfToken);
    res.json(LogoutAccountResponse.parse({ ok: true }));
  } catch (error) {
    logFailure(req, error, "logout");
    databaseUnavailable(res);
  }
});

export default router;

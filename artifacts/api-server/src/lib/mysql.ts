import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import mysql, {
  type Pool,
  type RowDataPacket,
} from "mysql2/promise";
import type { Request, Response } from "express";

const SESSION_COOKIE = "adpilot_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface AppSession {
  sessionId: string;
  csrfToken: string;
  userId: number | null;
}

interface SessionRow extends RowDataPacket {
  sessionId: string;
  csrfToken: string;
  userId: number | null;
}

let pool: Pool | undefined;
let sessionTableReady: Promise<void> | undefined;

export function isMysqlConfigured(): boolean {
  return Boolean(
    process.env.MYSQL_HOST &&
      process.env.MYSQL_DATABASE &&
      process.env.MYSQL_USER &&
      process.env.MYSQL_PASSWORD,
  );
}

export function getMysqlPool(): Pool {
  if (!isMysqlConfigured()) {
    throw new Error("MySQL connection settings are missing");
  }
  if (!pool) {
    const port = Number(process.env.MYSQL_PORT || "3306");
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error("MYSQL_PORT must be a valid port number");
    }
    pool = mysql.createPool({
      host: process.env.MYSQL_HOST,
      port,
      database: process.env.MYSQL_DATABASE,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      charset: "utf8mb4",
      timezone: "Z",
      supportBigNumbers: true,
      bigNumberStrings: false,
      ssl: process.env.MYSQL_SSL?.toLowerCase() === "false" ? undefined : {},
    });
  }
  return pool;
}

export async function ensureSessionTable(): Promise<void> {
  if (!sessionTableReady) {
    sessionTableReady = getMysqlPool()
      .query(
        `CREATE TABLE IF NOT EXISTS adpilot_sessions (
          session_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
          user_id BIGINT UNSIGNED NULL,
          csrf_token CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
          expires_at DATETIME NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (session_id),
          KEY idx_adpilot_sessions_expires_at (expires_at),
          KEY idx_adpilot_sessions_user_id (user_id),
          CONSTRAINT fk_adpilot_sessions_user
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      )
      .then(() => undefined)
      .catch((error: unknown) => {
        sessionTableReady = undefined;
        throw error;
      });
  }
  await sessionTableReady;
}

function hashSessionId(sessionId: string): string {
  return createHash("sha256").update(sessionId).digest("hex");
}

function setSessionCookie(res: Response, sessionId: string): void {
  res.cookie(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS,
  });
}

export async function getRequestSession(
  req: Request,
): Promise<AppSession | null> {
  const sessionId = req.cookies?.[SESSION_COOKIE];
  if (typeof sessionId !== "string" || sessionId.length < 32) {
    return null;
  }
  await ensureSessionTable();
  const [rows] = await getMysqlPool().execute<SessionRow[]>(
    `SELECT session_id AS sessionId, csrf_token AS csrfToken, user_id AS userId
     FROM adpilot_sessions
     WHERE session_id = ? AND expires_at > UTC_TIMESTAMP()
     LIMIT 1`,
    [hashSessionId(sessionId)],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    sessionId: hashSessionId(sessionId),
    csrfToken: row.csrfToken,
    userId: row.userId === null ? null : Number(row.userId),
  };
}

async function saveSession(
  res: Response,
  userId: number | null,
  csrfToken: string,
): Promise<void> {
  const rawSessionId = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const hashedSessionId = hashSessionId(rawSessionId);
  await getMysqlPool().execute(
    `INSERT INTO adpilot_sessions (session_id, user_id, csrf_token, expires_at)
     VALUES (?, ?, ?, ?)`,
    [hashedSessionId, userId, csrfToken, expiresAt],
  );
  setSessionCookie(res, rawSessionId);
}

export async function createAnonymousSession(
  res: Response,
  csrfToken = randomBytes(32).toString("hex"),
): Promise<string> {
  await ensureSessionTable();
  await getMysqlPool().execute(
    "DELETE FROM adpilot_sessions WHERE expires_at <= UTC_TIMESTAMP()",
  );
  await saveSession(res, null, csrfToken);
  return csrfToken;
}

export async function rotateSession(
  res: Response,
  previousSession: AppSession,
  userId: number,
): Promise<void> {
  await saveSession(res, userId, previousSession.csrfToken);
  await getMysqlPool().execute(
    "DELETE FROM adpilot_sessions WHERE session_id = ?",
    [previousSession.sessionId],
  );
}

export async function verifyCsrf(
  req: Request,
): Promise<AppSession | null> {
  const session = await getRequestSession(req);
  const submittedToken = req.get("X-CSRF-Token");
  if (
    !session ||
    !submittedToken ||
    submittedToken.length !== session.csrfToken.length
  ) {
    return null;
  }
  const submitted = Buffer.from(submittedToken);
  const expected = Buffer.from(session.csrfToken);
  return submitted.length === expected.length &&
    timingSafeEqual(submitted, expected)
    ? session
    : null;
}

export async function currentUserForSession(
  session: AppSession,
): Promise<{
  id: number;
  businessId: number;
  name: string;
  email: string;
  role: "owner" | "member";
} | null> {
  if (session.userId === null) return null;
  const [rows] = await getMysqlPool().execute<
    (RowDataPacket & {
      id: number;
      businessId: number;
      name: string;
      email: string;
      role: "owner" | "member";
    })[]
  >(
    `SELECT id, business_id AS businessId, name, email, role
     FROM users WHERE id = ? LIMIT 1`,
    [session.userId],
  );
  const user = rows[0];
  if (!user) return null;
  return {
    id: Number(user.id),
    businessId: Number(user.businessId),
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

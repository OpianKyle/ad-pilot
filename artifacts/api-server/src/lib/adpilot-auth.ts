import type { Request, Response } from "express";
import type { AppSession } from "./mysql";
import {
  currentUserForSession,
  getMysqlPool,
  getRequestSession,
  verifyCsrf,
} from "./mysql";
import { ensureAdpilotSchema } from "./adpilot-schema";

export interface AdpilotUser {
  id: number;
  businessId: number;
  name: string;
  email: string;
  role: "owner" | "member";
}

export interface AdpilotContext {
  user: AdpilotUser;
  session: AppSession;
  businessStatus: "pending" | "active" | "suspended";
  monthlyGenerationLimit: number;
  isPlatformOwner: boolean;
}

export function isPlatformOwnerEmail(email: string): boolean {
  const configured = process.env.ADPILOT_OWNER_EMAIL?.trim().toLowerCase();
  return Boolean(configured && configured === email.trim().toLowerCase());
}

export async function getAdpilotContext(
  req: Request,
  res: Response,
  options: { allowInactive?: boolean } = {},
): Promise<AdpilotContext | null> {
  try {
    await ensureAdpilotSchema();
    const session = await getRequestSession(req);
    if (!session) {
      res.status(401).json({ error: "Sign in to continue." });
      return null;
    }
    const user = await currentUserForSession(session);
    if (!user) {
      res.status(401).json({ error: "Sign in to continue." });
      return null;
    }
    const isPlatformOwner = isPlatformOwnerEmail(user.email);
    const [rows] = await getMysqlPool().execute<
      Array<{ status: "pending" | "active" | "suspended"; monthlyGenerationLimit: number }>
    >(
      `SELECT status, monthly_generation_limit AS monthlyGenerationLimit
       FROM adpilot_business_access WHERE business_id = ? LIMIT 1`,
      [user.businessId],
    );
    const access = rows[0];
    const businessStatus = access?.status ?? "active";
    const monthlyGenerationLimit = Number(access?.monthlyGenerationLimit ?? 30);
    if (!options.allowInactive && businessStatus !== "active" && !isPlatformOwner) {
      res.status(403).json({
        error: businessStatus === "pending"
          ? "Your workspace is waiting for owner activation."
          : "This workspace is suspended. Contact the service owner.",
      });
      return null;
    }
    return {
      user,
      session,
      businessStatus,
      monthlyGenerationLimit,
      isPlatformOwner,
    };
  } catch (error) {
    req.log.error({ err: error }, "AdPilot workspace authorization failed");
    res.status(503).json({ error: "The workspace service is temporarily unavailable." });
    return null;
  }
}

export async function requireAdpilotCsrf(
  req: Request,
  res: Response,
): Promise<AppSession | null> {
  try {
    const session = await verifyCsrf(req);
    if (!session) {
      res.status(403).json({ error: "Refresh the page and try again." });
      return null;
    }
    return session;
  } catch (error) {
    req.log.error({ err: error }, "AdPilot request validation failed");
    res.status(503).json({ error: "The workspace service is temporarily unavailable." });
    return null;
  }
}

export function publicBaseUrl(): string | null {
  const value = process.env.ADPILOT_PUBLIC_URL?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}

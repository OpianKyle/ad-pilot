import { Router, type IRouter, type Request, type Response } from "express";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import {
  CreateCampaignBody,
  CreateCampaignResponse,
  GetDashboardSummaryResponse,
  ListCampaignsResponse,
} from "@workspace/api-zod";
import {
  getMysqlPool,
  isMysqlConfigured,
  verifyCsrf,
} from "../lib/mysql";
import { getAdpilotContext } from "../lib/adpilot-auth";

const router: IRouter = Router();

interface CampaignRow extends RowDataPacket {
  id: number;
  title: string;
  caption: string | null;
  hashtags: string | null;
  status: "draft" | "scheduled" | "published";
  createdAt: Date | string;
}

function databaseUnavailable(res: Response): void {
  res.status(503).json({ error: "The MySQL database is not configured or is unavailable." });
}

function logFailure(req: Request, error: unknown, action: string): void {
  req.log.error({ err: error }, `AdPilot ${action} failed`);
}

async function getBusinessId(req: Request, res: Response): Promise<number | null> {
  const context = await getAdpilotContext(req, res);
  return context?.user.businessId ?? null;
}

function toCampaign(row: CampaignRow) {
  const createdAt =
    row.createdAt instanceof Date
      ? row.createdAt.toISOString()
      : new Date(row.createdAt).toISOString();
  return {
    id: Number(row.id),
    title: row.title,
    caption: row.caption,
    hashtags: row.hashtags,
    status: row.status,
    createdAt,
  };
}

router.get("/campaigns", async (req, res): Promise<void> => {
  if (!isMysqlConfigured()) {
    databaseUnavailable(res);
    return;
  }
  try {
    const businessId = await getBusinessId(req, res);
    if (businessId === null) return;
    const [rows] = await getMysqlPool().execute<CampaignRow[]>(
      `SELECT id, title, caption, hashtags, status, created_at AS createdAt
       FROM campaigns
       WHERE business_id = ?
       ORDER BY id DESC
       LIMIT 100`,
      [businessId],
    );
    res.json(ListCampaignsResponse.parse({ campaigns: rows.map(toCampaign) }));
  } catch (error) {
    logFailure(req, error, "campaign list");
    databaseUnavailable(res);
  }
});

router.post("/campaigns", async (req, res): Promise<void> => {
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
    const businessId = await getBusinessId(req, res);
    if (businessId === null) return;
    const parsed = CreateCampaignBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: "Campaign title must be 2–180 characters." });
      return;
    }
    const title = parsed.data.title.trim();
    if (title.length < 2) {
      res.status(422).json({ error: "Campaign title must be 2–180 characters." });
      return;
    }
    const [result] = await getMysqlPool().execute<ResultSetHeader>(
      `INSERT INTO campaigns (business_id, title, caption, hashtags)
       VALUES (?, ?, ?, ?)`,
      [businessId, title, parsed.data.caption, parsed.data.hashtags],
    );
    const [rows] = await getMysqlPool().execute<CampaignRow[]>(
      `SELECT id, title, caption, hashtags, status, created_at AS createdAt
       FROM campaigns WHERE id = ? AND business_id = ? LIMIT 1`,
      [result.insertId, businessId],
    );
    const campaign = rows[0];
    if (!campaign) {
      res.status(500).json({ error: "Campaign was created but could not be loaded." });
      return;
    }
    res.status(201).json(CreateCampaignResponse.parse(toCampaign(campaign)));
  } catch (error) {
    logFailure(req, error, "campaign creation");
    databaseUnavailable(res);
  }
});

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  if (!isMysqlConfigured()) {
    databaseUnavailable(res);
    return;
  }
  try {
    const businessId = await getBusinessId(req, res);
    if (businessId === null) return;
    const [counts] = await getMysqlPool().execute<
      (RowDataPacket & { status: string; count: number | string })[]
    >(
      `SELECT status, COUNT(*) AS count
       FROM campaigns WHERE business_id = ? GROUP BY status`,
      [businessId],
    );
    const [recentRows] = await getMysqlPool().execute<CampaignRow[]>(
      `SELECT id, title, caption, hashtags, status, created_at AS createdAt
       FROM campaigns
       WHERE business_id = ?
       ORDER BY id DESC
       LIMIT 5`,
      [businessId],
    );
    const totals = { draft: 0, scheduled: 0, published: 0 };
    for (const row of counts) {
      if (row.status in totals) {
        totals[row.status as keyof typeof totals] = Number(row.count);
      }
    }
    res.json(
      GetDashboardSummaryResponse.parse({
        total: totals.draft + totals.scheduled + totals.published,
        ...totals,
        recentCampaigns: recentRows.map(toCampaign),
      }),
    );
  } catch (error) {
    logFailure(req, error, "dashboard summary");
    databaseUnavailable(res);
  }
});

export default router;

import { randomBytes } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import {
  CancelAdpilotScheduledPostResponse,
  CreateAdpilotScheduledPostBody,
  CreateAdpilotScheduledPostResponse,
  ListAdpilotScheduledPostsResponse,
} from "@workspace/api-zod";
import {
  getAdpilotContext,
  requireAdpilotCsrf,
} from "../lib/adpilot-auth";
import {
  decryptProviderPayload,
} from "../lib/adpilot-credentials";
import { getMysqlPool, isMysqlConfigured } from "../lib/mysql";
import { parseMetaCredentialPayload } from "../lib/meta-provider";

const router: IRouter = Router();
type SocialPlatform = "facebook" | "instagram";

interface PostRow extends RowDataPacket {
  id: string;
  status: "scheduled" | "publishing" | "published" | "needs_attention" | "cancelled";
  caption: string;
  hashtags: string;
  assetId: string;
  scheduledAt: Date | string;
  platforms: unknown;
  facebookState: string | null;
  instagramState: string | null;
  facebookRemoteId: string | null;
  instagramRemoteId: string | null;
  error: string | null;
  createdAt: Date | string;
}

interface CredentialRow extends RowDataPacket {
  encryptedPayload: string;
}

function databaseUnavailable(res: Response): void {
  res.status(503).json({ error: "The MySQL database is not configured or is unavailable." });
}

function logFailure(req: Request, error: unknown, action: string): void {
  req.log.error({ err: error }, `AdPilot post ${action} failed`);
}

function parsePlatforms(value: unknown): SocialPlatform[] {
  let candidate = value;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(candidate)) return [];
  return candidate.filter(
    (platform): platform is SocialPlatform =>
      platform === "facebook" || platform === "instagram",
  );
}

function toIso(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? new Date(`${value}Z`).toISOString()
    : parsed.toISOString();
}

function toPost(row: PostRow) {
  return CreateAdpilotScheduledPostResponse.parse({
    id: row.id,
    status: row.status,
    caption: row.caption,
    hashtags: row.hashtags,
    assetId: row.assetId,
    imageUrl: `/api/adpilot/assets/${row.assetId}/content`,
    scheduledAt: toIso(row.scheduledAt),
    platforms: parsePlatforms(row.platforms),
    facebookState: row.facebookState,
    instagramState: row.instagramState,
    facebookRemoteId: row.facebookRemoteId,
    instagramRemoteId: row.instagramRemoteId,
    error: row.error,
    createdAt: toIso(row.createdAt),
  });
}

async function loadMetaCredentials(businessId: number) {
  const [rows] = await getMysqlPool().execute<CredentialRow[]>(
    `SELECT encrypted_payload AS encryptedPayload
     FROM adpilot_provider_vault
     WHERE business_id = ? AND provider = 'meta'
     LIMIT 1`,
    [businessId],
  );
  const encrypted = rows[0]?.encryptedPayload;
  if (!encrypted) return null;
  return parseMetaCredentialPayload(
    decryptProviderPayload(businessId, "meta", encrypted),
  );
}

router.get("/adpilot/posts", async (req, res): Promise<void> => {
  if (!isMysqlConfigured()) {
    databaseUnavailable(res);
    return;
  }
  try {
    const context = await getAdpilotContext(req, res);
    if (!context) return;
    const [rows] = await getMysqlPool().execute<PostRow[]>(
      `SELECT id, status, caption, hashtags, asset_id AS assetId,
              scheduled_at AS scheduledAt, platforms,
              facebook_state AS facebookState, instagram_state AS instagramState,
              facebook_remote_id AS facebookRemoteId,
              instagram_remote_id AS instagramRemoteId, error,
              created_at AS createdAt
       FROM adpilot_meta_posts
       WHERE business_id = ?
       ORDER BY scheduled_at DESC, created_at DESC
       LIMIT 100`,
      [context.user.businessId],
    );
    res.json(ListAdpilotScheduledPostsResponse.parse({ posts: rows.map(toPost) }));
  } catch (error) {
    logFailure(req, error, "list");
    databaseUnavailable(res);
  }
});

router.post("/adpilot/posts", async (req, res): Promise<void> => {
  if (!isMysqlConfigured()) {
    databaseUnavailable(res);
    return;
  }
  try {
    if (!(await requireAdpilotCsrf(req, res))) return;
    const context = await getAdpilotContext(req, res);
    if (!context) return;
    const parsed = CreateAdpilotScheduledPostBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: "Choose a photo, caption, time, and at least one channel." });
      return;
    }
    const caption = parsed.data.caption.trim();
    const hashtags = parsed.data.hashtags.trim();
    const finalCaption = [caption, hashtags].filter(Boolean).join("\n\n");
    if (!caption || finalCaption.length > 2200) {
      res.status(422).json({ error: "The caption and hashtags must total 2,200 characters or fewer." });
      return;
    }
    const scheduledAt = new Date(parsed.data.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() < Date.now() - 60_000) {
      res.status(422).json({ error: "Choose a future time or publish now." });
      return;
    }
    if (!process.env.PRIVATE_OBJECT_DIR?.trim()) {
      res.status(503).json({ error: "Private App Storage is not configured for post photos." });
      return;
    }
    const credentials = await loadMetaCredentials(context.user.businessId);
    if (!credentials) {
      res.status(409).json({ error: "Connect a Meta account before scheduling posts." });
      return;
    }
    const selectedFacebookPage = credentials.pages.find(
      (page) => page.id === credentials.selectedFacebookPageId,
    );
    const selectedInstagramPage = credentials.pages.find(
      (page) => page.instagramAccount?.id === credentials.selectedInstagramAccountId,
    );
    if (
      (parsed.data.platforms.includes("facebook") && !selectedFacebookPage) ||
      (parsed.data.platforms.includes("instagram") &&
        !selectedInstagramPage)
    ) {
      res.status(422).json({ error: "Connect and select the requested publishing destinations first." });
      return;
    }
    const [assets] = await getMysqlPool().execute<RowDataPacket[]>(
      `SELECT id FROM adpilot_media
       WHERE id = ? AND business_id = ? AND status = 'ready' AND rights_confirmed = 1
       LIMIT 1`,
      [parsed.data.assetId, context.user.businessId],
    );
    if (!assets[0]) {
      res.status(422).json({ error: "Choose a photo saved in this business workspace." });
      return;
    }
    const id = randomBytes(16).toString("hex");
    await getMysqlPool().execute(
      `INSERT INTO adpilot_meta_posts
        (id, business_id, caption, hashtags, asset_id, scheduled_at, platforms,
         facebook_page_id, instagram_account_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled')`,
      [
        id,
        context.user.businessId,
        caption,
        hashtags,
        parsed.data.assetId,
        scheduledAt,
        JSON.stringify(parsed.data.platforms),
        parsed.data.platforms.includes("facebook")
          ? credentials.selectedFacebookPageId
          : null,
        parsed.data.platforms.includes("instagram")
          ? credentials.selectedInstagramAccountId
          : null,
      ],
    );
    const [rows] = await getMysqlPool().execute<PostRow[]>(
      `SELECT id, status, caption, hashtags, asset_id AS assetId,
              scheduled_at AS scheduledAt, platforms,
              facebook_state AS facebookState, instagram_state AS instagramState,
              facebook_remote_id AS facebookRemoteId,
              instagram_remote_id AS instagramRemoteId, error,
              created_at AS createdAt
       FROM adpilot_meta_posts
       WHERE id = ? AND business_id = ? LIMIT 1`,
      [id, context.user.businessId],
    );
    const post = rows[0];
    if (!post) {
      res.status(500).json({ error: "The post was scheduled but could not be loaded." });
      return;
    }
    res.status(201).json(toPost(post));
  } catch (error) {
    logFailure(req, error, "schedule");
    res.status(503).json({ error: "The post could not be scheduled." });
  }
});

router.delete("/adpilot/posts/:id", async (req, res): Promise<void> => {
  if (!isMysqlConfigured()) {
    databaseUnavailable(res);
    return;
  }
  try {
    if (!(await requireAdpilotCsrf(req, res))) return;
    const context = await getAdpilotContext(req, res);
    if (!context) return;
    const id = typeof req.params.id === "string" ? req.params.id : "";
    if (!/^[a-f0-9]{32}$/.test(id)) {
      res.status(404).json({ error: "Scheduled post not found." });
      return;
    }
    const [rows] = await getMysqlPool().execute<PostRow[]>(
      `SELECT id, status, platforms FROM adpilot_meta_posts
       WHERE id = ? AND business_id = ? LIMIT 1`,
      [id, context.user.businessId],
    );
    const post = rows[0];
    if (!post) {
      res.status(404).json({ error: "Scheduled post not found." });
      return;
    }
    if (post.status !== "scheduled") {
      res.status(409).json({ error: "Publishing has already started or this post is no longer scheduled." });
      return;
    }
    const platforms = parsePlatforms(post.platforms);
    const [result] = await getMysqlPool().execute<ResultSetHeader>(
      `UPDATE adpilot_meta_posts
       SET status = 'cancelled',
           facebook_state = ?,
           instagram_state = ?,
           error = 'Cancelled by a workspace member.'
       WHERE id = ? AND business_id = ? AND status = 'scheduled'`,
      [
        platforms.includes("facebook") ? "cancelled" : null,
        platforms.includes("instagram") ? "cancelled" : null,
        id,
        context.user.businessId,
      ],
    );
    if (result.affectedRows !== 1) {
      res.status(409).json({ error: "Publishing has already started or this post is no longer scheduled." });
      return;
    }
    res.json(CancelAdpilotScheduledPostResponse.parse({ ok: true }));
  } catch (error) {
    logFailure(req, error, "cancellation");
    databaseUnavailable(res);
  }
});

export default router;

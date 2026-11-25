import { randomBytes } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import sharp from "sharp";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import {
  MediaAsset,
  MediaCompleteInput,
  MediaList,
  MediaUploadInput,
  MediaUploadResponse,
  OkResponse,
} from "@workspace/api-zod";
import {
  createPrivateObjectPath,
  deletePrivateObject,
  getPrivateObject,
  requestPrivateUploadUrl,
  savePrivateObject,
} from "../lib/adpilot-storage";
import {
  getAdpilotContext,
  requireAdpilotCsrf,
} from "../lib/adpilot-auth";
import { getMysqlPool, isMysqlConfigured } from "../lib/mysql";

const router: IRouter = Router();
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 40_000_000;

interface AssetRow extends RowDataPacket {
  id: string;
  title: string;
  objectPath: string;
  mimeType: string;
  status: "uploading" | "ready" | "failed";
  createdAt: Date | string;
}

function databaseUnavailable(res: Response): void {
  res.status(503).json({ error: "The MySQL database is not configured or is unavailable." });
}

function logFailure(req: Request, error: unknown, action: string): void {
  req.log.error({ err: error }, `AdPilot photograph ${action} failed`);
}

function toAsset(row: AssetRow) {
  const createdAt =
    row.createdAt instanceof Date
      ? row.createdAt.toISOString()
      : new Date(row.createdAt).toISOString();
  return {
    id: row.id,
    title: row.title,
    imageUrl: `/api/adpilot/assets/${row.id}/content`,
    createdAt,
  };
}

router.get("/adpilot/assets", async (req, res): Promise<void> => {
  if (!isMysqlConfigured()) {
    databaseUnavailable(res);
    return;
  }
  try {
    const context = await getAdpilotContext(req, res);
    if (!context) return;
    const [rows] = await getMysqlPool().execute<AssetRow[]>(
      `SELECT id, title, object_path AS objectPath, mime_type AS mimeType,
              status, created_at AS createdAt
       FROM adpilot_media
       WHERE business_id = ? AND status = 'ready' AND rights_confirmed = 1
       ORDER BY created_at DESC
       LIMIT 100`,
      [context.user.businessId],
    );
    res.json(MediaList.parse({ assets: rows.map(toAsset) }));
  } catch (error) {
    logFailure(req, error, "list");
    databaseUnavailable(res);
  }
});

router.post("/adpilot/assets/upload-url", async (req, res): Promise<void> => {
  if (!isMysqlConfigured()) {
    databaseUnavailable(res);
    return;
  }
  try {
    if (!(await requireAdpilotCsrf(req, res))) return;
    const context = await getAdpilotContext(req, res);
    if (!context) return;
    const parsed = MediaUploadInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: "Upload a JPEG or PNG image up to 5 MB." });
      return;
    }
    const id = randomBytes(16).toString("hex");
    const { uploadUrl, objectPath } = await requestPrivateUploadUrl(
      parsed.data.contentType,
    );
    await getMysqlPool().execute(
      `INSERT INTO adpilot_media
        (id, business_id, title, object_path, mime_type, rights_confirmed, status, created_by)
       VALUES (?, ?, ?, ?, ?, 0, 'uploading', ?)`,
      [
        id,
        context.user.businessId,
        parsed.data.name.slice(0, 120),
        objectPath,
        parsed.data.contentType,
        context.user.id,
      ],
    );
    res.json(MediaUploadResponse.parse({ id, uploadUrl, objectPath }));
  } catch (error) {
    logFailure(req, error, "upload setup");
    res.status(503).json({
      error: "Private photo storage is not configured. Set up App Storage and try again.",
    });
  }
});

router.post("/adpilot/assets/:id/complete", async (req, res): Promise<void> => {
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
      res.status(404).json({ error: "Photo upload not found." });
      return;
    }
    const parsed = MediaCompleteInput.safeParse(req.body);
    if (!parsed.success || !parsed.data.rightsConfirmed) {
      res.status(422).json({ error: "Confirm that you have permission to use this photo." });
      return;
    }
    const [rows] = await getMysqlPool().execute<AssetRow[]>(
      `SELECT id, title, object_path AS objectPath, mime_type AS mimeType,
              status, created_at AS createdAt
       FROM adpilot_media
       WHERE id = ? AND business_id = ? AND status = 'uploading'
       LIMIT 1`,
      [id, context.user.businessId],
    );
    const pending = rows[0];
    if (!pending) {
      res.status(404).json({ error: "Photo upload not found or already completed." });
      return;
    }
    const uploaded = await getPrivateObject(pending.objectPath);
    if (uploaded.buffer.length > MAX_IMAGE_BYTES) {
      await deletePrivateObject(pending.objectPath);
      await getMysqlPool().execute(
        "DELETE FROM adpilot_media WHERE id = ? AND business_id = ?",
        [id, context.user.businessId],
      );
      res.status(422).json({ error: "This photo is larger than 5 MB." });
      return;
    }
    const image = await sharp(uploaded.buffer, {
      limitInputPixels: MAX_IMAGE_PIXELS,
      failOn: "error",
    })
      .rotate()
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();
    const finalPath = createPrivateObjectPath("media", `${id}.jpg`);
    await savePrivateObject(finalPath, image, "image/jpeg");
    await deletePrivateObject(pending.objectPath);
    const [result] = await getMysqlPool().execute<ResultSetHeader>(
      `UPDATE adpilot_media
       SET title = ?, object_path = ?, mime_type = 'image/jpeg',
           rights_confirmed = 1, status = 'ready'
       WHERE id = ? AND business_id = ? AND status = 'uploading'`,
      [
        parsed.data.title.trim().slice(0, 120),
        finalPath,
        id,
        context.user.businessId,
      ],
    );
    if (result.affectedRows !== 1) {
      await deletePrivateObject(finalPath);
      res.status(409).json({ error: "This upload changed before it could be completed." });
      return;
    }
    const [readyRows] = await getMysqlPool().execute<AssetRow[]>(
      `SELECT id, title, object_path AS objectPath, mime_type AS mimeType,
              status, created_at AS createdAt
       FROM adpilot_media
       WHERE id = ? AND business_id = ? AND status = 'ready'
       LIMIT 1`,
      [id, context.user.businessId],
    );
    const readyAsset = readyRows[0];
    if (!readyAsset) {
      res.status(500).json({ error: "The photo was saved but could not be loaded." });
      return;
    }
    res.json(MediaAsset.parse(toAsset(readyAsset)));
  } catch (error) {
    logFailure(req, error, "finalization");
    res.status(422).json({ error: "This file could not be processed as a JPEG or PNG photo." });
  }
});

router.get("/adpilot/assets/:id/content", async (req, res): Promise<void> => {
  if (!isMysqlConfigured()) {
    databaseUnavailable(res);
    return;
  }
  try {
    const context = await getAdpilotContext(req, res);
    if (!context) return;
    const id = typeof req.params.id === "string" ? req.params.id : "";
    if (!/^[a-f0-9]{32}$/.test(id)) {
      res.status(404).json({ error: "Photo not found." });
      return;
    }
    const [rows] = await getMysqlPool().execute<AssetRow[]>(
      `SELECT id, title, object_path AS objectPath, mime_type AS mimeType,
              status, created_at AS createdAt
       FROM adpilot_media
       WHERE id = ? AND business_id = ? AND status = 'ready' AND rights_confirmed = 1
       LIMIT 1`,
      [id, context.user.businessId],
    );
    const asset = rows[0];
    if (!asset) {
      res.status(404).json({ error: "Photo not found." });
      return;
    }
    const file = await getPrivateObject(asset.objectPath);
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(file.buffer);
  } catch (error) {
    logFailure(req, error, "read");
    res.status(503).json({ error: "This photo could not be loaded." });
  }
});

router.delete("/adpilot/assets/:id", async (req, res): Promise<void> => {
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
      res.status(404).json({ error: "Photo not found." });
      return;
    }
    const pool = getMysqlPool();
    const connection = await pool.getConnection();
    let objectPath: string | null = null;
    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute<AssetRow[]>(
        `SELECT id, title, object_path AS objectPath, mime_type AS mimeType,
                status, created_at AS createdAt
         FROM adpilot_media
         WHERE id = ? AND business_id = ? AND status = 'ready'
         LIMIT 1 FOR UPDATE`,
        [id, context.user.businessId],
      );
      const asset = rows[0];
      if (!asset) {
        await connection.rollback();
        res.status(404).json({ error: "Photo not found." });
        return;
      }
      const [posts] = await connection.execute<RowDataPacket[]>(
        `SELECT id FROM adpilot_meta_posts
         WHERE business_id = ? AND asset_id = ?
           AND status IN ('scheduled', 'publishing', 'published', 'needs_attention')
         LIMIT 1 FOR UPDATE`,
        [context.user.businessId, id],
      );
      if (posts.length) {
        await connection.rollback();
        res.status(409).json({ error: "This photo is attached to a post and cannot be removed." });
        return;
      }
      objectPath = asset.objectPath;
      await connection.execute(
        "DELETE FROM adpilot_media WHERE id = ? AND business_id = ?",
        [id, context.user.businessId],
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    if (objectPath) await deletePrivateObject(objectPath);
    res.json(OkResponse.parse({ ok: true }));
  } catch (error) {
    logFailure(req, error, "deletion");
    res.status(503).json({ error: "This photo could not be removed." });
  }
});

export default router;

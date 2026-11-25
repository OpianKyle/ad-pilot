import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { decryptProviderPayload } from "./adpilot-credentials";
import { getMysqlPool, isMysqlConfigured } from "./mysql";
import { signedPrivateReadUrl } from "./adpilot-storage";
import { logger } from "./logger";
import {
  MetaProviderError,
  parseMetaCredentialPayload,
  publishFacebookPhoto,
  publishInstagramPhoto,
} from "./meta-provider";

type SocialPlatform = "facebook" | "instagram";

interface DuePostRow extends RowDataPacket {
  id: string;
  businessId: number;
  caption: string;
  hashtags: string;
  assetId: string;
  platforms: unknown;
}

interface CredentialRow extends RowDataPacket {
  encryptedPayload: string;
}

interface AssetRow extends RowDataPacket {
  objectPath: string;
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

function errorMessage(error: unknown): string {
  if (error instanceof MetaProviderError) return error.message;
  return "The post could not be published. Reconnect Meta and try again.";
}

async function claimNextDuePost(): Promise<DuePostRow | null> {
  const connection = await getMysqlPool().getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute<DuePostRow[]>(
      `SELECT id, business_id AS businessId, caption, hashtags,
              asset_id AS assetId, platforms
       FROM adpilot_meta_posts
       WHERE status = 'scheduled' AND scheduled_at <= UTC_TIMESTAMP()
       ORDER BY scheduled_at ASC
       LIMIT 1 FOR UPDATE`,
    );
    const post = rows[0];
    if (!post) {
      await connection.commit();
      return null;
    }
    const platforms = parsePlatforms(post.platforms);
    await connection.execute(
      `UPDATE adpilot_meta_posts
       SET status = 'publishing',
           facebook_state = IF(JSON_CONTAINS(platforms, JSON_QUOTE('facebook')), 'publishing', NULL),
           instagram_state = IF(JSON_CONTAINS(platforms, JSON_QUOTE('instagram')), 'publishing', NULL),
           error = NULL
       WHERE id = ? AND status = 'scheduled'`,
      [post.id],
    );
    await connection.commit();
    return { ...post, platforms };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function setPostFailed(
  post: DuePostRow,
  message: string,
): Promise<void> {
  const platforms = parsePlatforms(post.platforms);
  await getMysqlPool().execute(
    `UPDATE adpilot_meta_posts
     SET status = 'needs_attention',
         facebook_state = IF(? = 1, 'needs_attention', facebook_state),
         instagram_state = IF(? = 1, 'needs_attention', instagram_state),
         error = ?
     WHERE id = ? AND business_id = ?`,
    [
      platforms.includes("facebook") ? 1 : 0,
      platforms.includes("instagram") ? 1 : 0,
      message.slice(0, 1000),
      post.id,
      post.businessId,
    ],
  );
}

async function publishPost(post: DuePostRow): Promise<void> {
  const platforms = parsePlatforms(post.platforms);
  const [credentialRows] = await getMysqlPool().execute<CredentialRow[]>(
    `SELECT encrypted_payload AS encryptedPayload
     FROM adpilot_provider_vault
     WHERE business_id = ? AND provider = 'meta'
     LIMIT 1`,
    [post.businessId],
  );
  const encrypted = credentialRows[0]?.encryptedPayload;
  if (!encrypted) {
    await setPostFailed(post, "The Meta account is disconnected. Reconnect and schedule this post again.");
    return;
  }
  const credentials = parseMetaCredentialPayload(
    decryptProviderPayload(post.businessId, "meta", encrypted),
  );
  const selectedPage = credentials.pages.find(
    (page) => page.id === credentials.selectedFacebookPageId,
  );
  const needsPage =
    platforms.includes("facebook") || platforms.includes("instagram");
  if (needsPage && !selectedPage) {
    await setPostFailed(post, "No Facebook Page is selected. Choose a destination and schedule this post again.");
    return;
  }
  if (
    platforms.includes("instagram") &&
    selectedPage?.instagramAccount?.id !== credentials.selectedInstagramAccountId
  ) {
    await setPostFailed(post, "The selected Instagram account is no longer linked. Reconnect and schedule this post again.");
    return;
  }
  const [assets] = await getMysqlPool().execute<AssetRow[]>(
    `SELECT object_path AS objectPath FROM adpilot_media
     WHERE id = ? AND business_id = ? AND status = 'ready' AND rights_confirmed = 1
     LIMIT 1`,
    [post.assetId, post.businessId],
  );
  if (!assets[0]) {
    await setPostFailed(post, "The selected photo is unavailable. Choose another photo and schedule again.");
    return;
  }

  let imageUrl: string;
  try {
    imageUrl = await signedPrivateReadUrl(assets[0].objectPath, 10 * 60);
  } catch {
    await setPostFailed(post, "Private photo storage is unavailable. Check App Storage and schedule again.");
    return;
  }
  const caption = [post.caption.trim(), post.hashtags.trim()]
    .filter(Boolean)
    .join("\n\n");
  const failures: string[] = [];

  for (const platform of platforms) {
    try {
      if (platform === "facebook" && selectedPage) {
        const remoteId = await publishFacebookPhoto({
          page: selectedPage,
          imageUrl,
          caption,
        });
        await getMysqlPool().execute(
          `UPDATE adpilot_meta_posts
           SET facebook_state = 'published', facebook_remote_id = ?
           WHERE id = ? AND business_id = ?`,
          [remoteId, post.id, post.businessId],
        );
      } else if (platform === "instagram" && selectedPage) {
        const remoteId = await publishInstagramPhoto({
          page: selectedPage,
          imageUrl,
          caption,
        });
        await getMysqlPool().execute(
          `UPDATE adpilot_meta_posts
           SET instagram_state = 'published', instagram_remote_id = ?
           WHERE id = ? AND business_id = ?`,
          [remoteId, post.id, post.businessId],
        );
      }
    } catch (error) {
      const message = errorMessage(error);
      failures.push(`${platform}: ${message}`);
      await getMysqlPool().execute(
        `UPDATE adpilot_meta_posts
         SET ${platform}_state = 'needs_attention'
         WHERE id = ? AND business_id = ?`,
        [post.id, post.businessId],
      );
    }
  }

  await getMysqlPool().execute<ResultSetHeader>(
    `UPDATE adpilot_meta_posts
     SET status = ?, error = ?
     WHERE id = ? AND business_id = ?`,
    [
      failures.length ? "needs_attention" : "published",
      failures.length ? failures.join(" · ").slice(0, 1000) : null,
      post.id,
      post.businessId,
    ],
  );
  if (failures.length) {
    logger.warn(
      { postId: post.id, businessId: post.businessId, failedChannels: failures.length },
      "Meta post needs attention",
    );
  } else {
    logger.info(
      { postId: post.id, businessId: post.businessId, channels: platforms },
      "Meta post published",
    );
  }
}

let workerTimer: NodeJS.Timeout | undefined;
let workerRunning = false;

export function startMetaPublisherWorker(): void {
  if (workerTimer) return;
  workerTimer = setInterval(() => {
    if (workerRunning || !isMysqlConfigured()) return;
    workerRunning = true;
    void (async () => {
      try {
        for (let count = 0; count < 5; count += 1) {
          const post = await claimNextDuePost();
          if (!post) break;
          try {
            await publishPost(post);
          } catch (error) {
            logger.error(
              { err: error, postId: post.id, businessId: post.businessId },
              "Meta publishing worker failed",
            );
            await setPostFailed(post, errorMessage(error));
          }
        }
      } catch (error) {
        logger.error({ err: error }, "Meta publishing queue check failed");
      } finally {
        workerRunning = false;
      }
    })();
  }, 15_000);
  workerTimer.unref();
}

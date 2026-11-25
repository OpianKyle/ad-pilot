import { createHash, randomBytes } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import {
  MetaConnectionStatus,
  MetaDeletionReceipt,
  MetaDeletionStatus,
  MetaAssetSelectionInput,
  OkResponse,
} from "@workspace/api-zod";
import {
  currentUserForSession,
  getMysqlPool,
  getRequestSession,
  isMysqlConfigured,
  verifyCsrf,
} from "../lib/mysql";
import {
  getAdpilotContext,
  publicBaseUrl,
} from "../lib/adpilot-auth";
import {
  buildMetaAuthorizationUrl,
  exchangeMetaAuthorizationCode,
  hashMetaUserId,
  MetaProviderError,
  parseMetaCredentialPayload,
  verifyMetaSignedRequest,
  type MetaCredentialPayload,
} from "../lib/meta-provider";
import {
  decryptProviderPayload,
  encryptProviderPayload,
} from "../lib/adpilot-credentials";

const router: IRouter = Router();
const META_PROVIDER = "meta";
const OAUTH_STATE_TTL_MINUTES = 10;

interface CredentialRow extends RowDataPacket {
  encryptedPayload: string;
}

interface OAuthStateRow extends RowDataPacket {
  businessId: number;
  userId: number;
}

interface IdentityRow extends RowDataPacket {
  businessId: number;
}

interface DeletionRow extends RowDataPacket {
  requestedAt: Date | string;
}

function databaseUnavailable(res: Response): void {
  res.status(503).json({ error: "The MySQL database is not configured or is unavailable." });
}

function logFailure(req: Request, error: unknown, action: string): void {
  req.log.error({ err: error }, `AdPilot Meta ${action} failed`);
}

async function loadCredentials(businessId: number): Promise<MetaCredentialPayload | null> {
  const [rows] = await getMysqlPool().execute<CredentialRow[]>(
    `SELECT encrypted_payload AS encryptedPayload
     FROM adpilot_provider_vault
     WHERE business_id = ? AND provider = ?
     LIMIT 1`,
    [businessId, META_PROVIDER],
  );
  const row = rows[0];
  if (!row) return null;
  return parseMetaCredentialPayload(
    decryptProviderPayload(businessId, META_PROVIDER, row.encryptedPayload),
  );
}

function connectionStatus(
  credentials: MetaCredentialPayload | null,
) {
  const selectedPage = credentials?.pages.find(
    (page) => page.id === credentials.selectedFacebookPageId,
  );
  const selectedInstagram = credentials?.pages.find(
    (page) => page.instagramAccount?.id === credentials.selectedInstagramAccountId,
  )?.instagramAccount;
  return MetaConnectionStatus.parse({
    connected: Boolean(credentials),
    connectedAt: credentials?.connectedAt ?? null,
    facebookPageId: selectedPage?.id ?? null,
    facebookPageName: selectedPage?.name ?? null,
    instagramAccountId: selectedInstagram?.id ?? null,
    instagramUsername: selectedInstagram?.username ?? null,
    availableFacebookPages: credentials?.pages.map(({ id, name }) => ({ id, name })) ?? [],
    availableInstagramAccounts:
      credentials?.pages.flatMap((page) =>
        page.instagramAccount
          ? [{
              id: page.instagramAccount.id,
              name: `${page.instagramAccount.username} · ${page.name}`.slice(0, 180),
            }]
          : [],
      ) ?? [],
  });
}

async function signedInUser(req: Request, res: Response) {
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
  return user;
}

async function consumeOAuthState(
  state: string,
  userId: number | null,
  businessId: number | null,
): Promise<boolean> {
  const connection = await getMysqlPool().getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute<OAuthStateRow[]>(
      `SELECT business_id AS businessId, user_id AS userId
       FROM adpilot_oauth_states
       WHERE state_hash = ? AND provider = ? AND expires_at > UTC_TIMESTAMP()
       LIMIT 1 FOR UPDATE`,
      [createHash("sha256").update(state).digest("hex"), META_PROVIDER],
    );
    const savedState = rows[0];
    if (savedState) {
      await connection.execute(
        "DELETE FROM adpilot_oauth_states WHERE state_hash = ?",
        [createHash("sha256").update(state).digest("hex")],
      );
    }
    await connection.commit();
    return Boolean(
      savedState &&
      userId !== null &&
      businessId !== null &&
      Number(savedState.userId) === userId &&
      Number(savedState.businessId) === businessId,
    );
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

router.post("/adpilot/oauth/:provider/start", async (req, res): Promise<void> => {
  if (!isMysqlConfigured()) {
    databaseUnavailable(res);
    return;
  }
  try {
    if (req.params.provider !== META_PROVIDER) {
      res.status(501).json({ error: "This account provider is not available yet." });
      return;
    }
    const csrfSession = await verifyCsrf(req);
    if (!csrfSession) {
      res.status(403).json({ error: "Refresh the page and try again." });
      return;
    }
    const context = await getAdpilotContext(req, res);
    if (!context) return;
    const baseUrl = publicBaseUrl();
    if (!baseUrl) {
      res.status(503).json({
        error: "Set ADPILOT_PUBLIC_URL to your HTTPS app origin before connecting Meta.",
      });
      return;
    }
    const redirectUri = `${baseUrl}/api/adpilot/oauth/meta/callback`;
    const state = randomBytes(32).toString("hex");
    await getMysqlPool().execute(
      `DELETE FROM adpilot_oauth_states
       WHERE business_id = ? AND provider = ?`,
      [context.user.businessId, META_PROVIDER],
    );
    await getMysqlPool().execute(
      `INSERT INTO adpilot_oauth_states
        (state_hash, business_id, user_id, provider, expires_at)
       VALUES (?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE))`,
      [
        createHash("sha256").update(state).digest("hex"),
        context.user.businessId,
        context.user.id,
        META_PROVIDER,
        OAUTH_STATE_TTL_MINUTES,
      ],
    );
    const url = buildMetaAuthorizationUrl(state, redirectUri);
    res.json({ url });
  } catch (error) {
    if (error instanceof MetaProviderError) {
      res.status(503).json({ error: error.message });
      return;
    }
    logFailure(req, error, "authorization start");
    databaseUnavailable(res);
  }
});

router.get("/adpilot/oauth/meta/callback", async (req, res): Promise<void> => {
  if (!isMysqlConfigured()) {
    res.status(503).send("The workspace database is unavailable. Return to AdPilot and try again.");
    return;
  }
  const state = typeof req.query.state === "string" ? req.query.state : "";
  if (!/^[a-f0-9]{64}$/.test(state)) {
    res.status(400).send("This Meta authorization has expired. Start again from Channels.");
    return;
  }
  try {
    const user = await signedInUser(req, res);
    if (!user) return;
    const stateIsValid = await consumeOAuthState(state, user.id, user.businessId);
    const baseUrl = publicBaseUrl();
    if (!stateIsValid || !baseUrl) {
      res.status(400).send("This Meta authorization has expired. Start again from Channels.");
      return;
    }
    if (typeof req.query.error === "string") {
      res.redirect(new URL("/connections?meta=cancelled", baseUrl).toString());
      return;
    }
    const code = typeof req.query.code === "string" ? req.query.code : "";
    if (!code || code.length > 4096) {
      res.status(400).send("Meta did not return an authorization code. Start again from Channels.");
      return;
    }
    const redirectUri = `${baseUrl}/api/adpilot/oauth/meta/callback`;
    const result = await exchangeMetaAuthorizationCode(code, redirectUri);
    const encryptedPayload = encryptProviderPayload(
      user.businessId,
      META_PROVIDER,
      result.credentials as unknown as Record<string, unknown>,
    );
    const pool = getMysqlPool();
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(
        `INSERT INTO adpilot_provider_vault
          (business_id, provider, encrypted_payload)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE encrypted_payload = VALUES(encrypted_payload)`,
        [user.businessId, META_PROVIDER, encryptedPayload],
      );
      await connection.execute(
        `INSERT INTO adpilot_meta_identities (business_id, meta_user_hash, connected_at)
         VALUES (?, ?, UTC_TIMESTAMP())
         ON DUPLICATE KEY UPDATE
           meta_user_hash = VALUES(meta_user_hash),
           connected_at = VALUES(connected_at)`,
        [user.businessId, hashMetaUserId(result.metaUserId)],
      );
      await connection.execute(
        `UPDATE adpilot_meta_posts
         SET status = 'cancelled', error = 'Meta was reconnected; review this post before scheduling again.'
         WHERE business_id = ? AND status = 'scheduled'`,
        [user.businessId],
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    res.redirect(new URL("/connections?meta=connected", baseUrl).toString());
  } catch (error) {
    if (error instanceof MetaProviderError) {
      req.log.warn({ message: error.message }, "Meta authorization was not completed");
      const baseUrl = publicBaseUrl();
      if (baseUrl) {
        res.redirect(new URL("/connections?meta=failed", baseUrl).toString());
        return;
      }
      res.status(503).send("Meta authorization could not be completed. Return to AdPilot and try again.");
      return;
    }
    logFailure(req, error, "authorization callback");
    res.status(503).send("Meta authorization could not be completed. Return to AdPilot and try again.");
  }
});

router.get("/adpilot/connections/meta", async (req, res): Promise<void> => {
  if (!isMysqlConfigured()) {
    databaseUnavailable(res);
    return;
  }
  try {
    const context = await getAdpilotContext(req, res);
    if (!context) return;
    const credentials = await loadCredentials(context.user.businessId);
    res.json(connectionStatus(credentials));
  } catch (error) {
    logFailure(req, error, "connection status");
    res.status(503).json({ error: "The Meta connection could not be loaded." });
  }
});

router.put("/adpilot/connections/meta/select", async (req, res): Promise<void> => {
  if (!isMysqlConfigured()) {
    databaseUnavailable(res);
    return;
  }
  try {
    if (!(await verifyCsrf(req))) {
      res.status(403).json({ error: "Refresh the page and try again." });
      return;
    }
    const context = await getAdpilotContext(req, res);
    if (!context) return;
    const parsed = MetaAssetSelectionInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: "Choose at least one Facebook or Instagram destination." });
      return;
    }
    const credentials = await loadCredentials(context.user.businessId);
    if (!credentials) {
      res.status(409).json({ error: "Connect a Meta account before choosing destinations." });
      return;
    }
    const { facebookPageId, instagramAccountId } = parsed.data;
    const pageForInstagram = instagramAccountId
      ? credentials.pages.find((page) => page.instagramAccount?.id === instagramAccountId)
      : undefined;
    if (instagramAccountId && !pageForInstagram) {
      res.status(422).json({ error: "That Instagram account is no longer shared with this Meta app." });
      return;
    }
    const pageId = facebookPageId ?? pageForInstagram?.id ?? null;
    const selectedPage = pageId
      ? credentials.pages.find((page) => page.id === pageId)
      : undefined;
    if (pageId && !selectedPage) {
      res.status(422).json({ error: "That Facebook Page is no longer shared with this Meta app." });
      return;
    }
    if (
      instagramAccountId &&
      selectedPage?.instagramAccount?.id !== instagramAccountId
    ) {
      res.status(422).json({ error: "Choose the Instagram account linked to the selected Facebook Page." });
      return;
    }
    credentials.selectedFacebookPageId = pageId;
    credentials.selectedInstagramAccountId = instagramAccountId;
    await getMysqlPool().execute(
      `UPDATE adpilot_provider_vault SET encrypted_payload = ?
       WHERE business_id = ? AND provider = ?`,
      [
        encryptProviderPayload(
          context.user.businessId,
          META_PROVIDER,
          credentials as unknown as Record<string, unknown>,
        ),
        context.user.businessId,
        META_PROVIDER,
      ],
    );
    res.json(connectionStatus(credentials));
  } catch (error) {
    if (error instanceof MetaProviderError) {
      res.status(503).json({ error: error.message });
      return;
    }
    logFailure(req, error, "destination selection");
    res.status(503).json({ error: "The Meta destinations could not be saved." });
  }
});

router.delete("/adpilot/connections/meta", async (req, res): Promise<void> => {
  if (!isMysqlConfigured()) {
    databaseUnavailable(res);
    return;
  }
  try {
    if (!(await verifyCsrf(req))) {
      res.status(403).json({ error: "Refresh the page and try again." });
      return;
    }
    const context = await getAdpilotContext(req, res);
    if (!context) return;
    const connection = await getMysqlPool().getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(
        "DELETE FROM adpilot_provider_vault WHERE business_id = ? AND provider = ?",
        [context.user.businessId, META_PROVIDER],
      );
      await connection.execute(
        "DELETE FROM adpilot_meta_identities WHERE business_id = ?",
        [context.user.businessId],
      );
      await connection.execute(
        `UPDATE adpilot_meta_posts
         SET status = 'cancelled', error = 'Meta was disconnected. Reconnect and review before scheduling again.'
         WHERE business_id = ? AND status = 'scheduled'`,
        [context.user.businessId],
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    res.json(OkResponse.parse({ ok: true }));
  } catch (error) {
    logFailure(req, error, "disconnect");
    databaseUnavailable(res);
  }
});

router.post("/meta/data-deletion", async (req, res): Promise<void> => {
  if (!isMysqlConfigured()) {
    databaseUnavailable(res);
    return;
  }
  const signedRequest =
    typeof req.body?.signed_request === "string"
      ? req.body.signed_request.slice(0, 12_000)
      : "";
  if (!signedRequest) {
    res.status(400).json({ error: "A signed Meta request is required." });
    return;
  }
  try {
    const verified = verifyMetaSignedRequest(signedRequest);
    if (!verified) {
      res.status(400).json({ error: "The signed Meta request is invalid." });
      return;
    }
    const baseUrl = publicBaseUrl();
    if (!baseUrl) {
      res.status(503).json({ error: "The public app URL is not configured." });
      return;
    }
    const code = randomBytes(16).toString("hex");
    const codeHash = createHash("sha256").update(code).digest("hex");
    const pool = getMysqlPool();
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [identities] = await connection.execute<IdentityRow[]>(
        `SELECT business_id AS businessId
         FROM adpilot_meta_identities WHERE meta_user_hash = ?`,
        [hashMetaUserId(verified.userId)],
      );
      const businessIds = identities.map((row) => Number(row.businessId));
      if (businessIds.length) {
        const placeholders = businessIds.map(() => "?").join(", ");
        await connection.execute(
          `DELETE FROM adpilot_provider_vault
           WHERE provider = ? AND business_id IN (${placeholders})`,
          [META_PROVIDER, ...businessIds],
        );
        await connection.execute(
          `DELETE FROM adpilot_meta_identities
           WHERE business_id IN (${placeholders})`,
          businessIds,
        );
        await connection.execute(
          `UPDATE adpilot_meta_posts
           SET status = IF(status = 'scheduled', 'cancelled', status),
               facebook_remote_id = NULL,
               instagram_remote_id = NULL,
               error = IF(status = 'scheduled', 'The connected Meta account requested data deletion.', error)
           WHERE business_id IN (${placeholders})`,
          businessIds,
        );
      }
      await connection.execute(
        `INSERT INTO adpilot_meta_deletion_requests (code_hash, requested_at)
         VALUES (?, UTC_TIMESTAMP())`,
        [codeHash],
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    res.json(
      MetaDeletionReceipt.parse({
        url: new URL(`/api/meta/data-deletion/${code}`, baseUrl).toString(),
        confirmation_code: code,
      }),
    );
  } catch (error) {
    if (error instanceof MetaProviderError) {
      res.status(503).json({ error: "The Meta app secret is not configured." });
      return;
    }
    logFailure(req, error, "data deletion request");
    databaseUnavailable(res);
  }
});

router.get("/meta/data-deletion/:code", async (req, res): Promise<void> => {
  if (!isMysqlConfigured()) {
    databaseUnavailable(res);
    return;
  }
  const code = typeof req.params.code === "string" ? req.params.code : "";
  if (!/^[a-f0-9]{32}$/.test(code)) {
    res.status(404).json({ error: "Deletion request not found." });
    return;
  }
  try {
    const [rows] = await getMysqlPool().execute<DeletionRow[]>(
      `SELECT requested_at AS requestedAt
       FROM adpilot_meta_deletion_requests WHERE code_hash = ? LIMIT 1`,
      [createHash("sha256").update(code).digest("hex")],
    );
    const request = rows[0];
    if (!request) {
      res.status(404).json({ error: "Deletion request not found." });
      return;
    }
    const requestedAt =
      request.requestedAt instanceof Date
        ? request.requestedAt.toISOString()
        : new Date(`${request.requestedAt}Z`).toISOString();
    res.json(
      MetaDeletionStatus.parse({
        status: "completed",
        requestedAt,
      }),
    );
  } catch (error) {
    logFailure(req, error, "deletion status");
    databaseUnavailable(res);
  }
});

export default router;

import { createHmac, createHash, timingSafeEqual } from "node:crypto";

export const META_GRAPH_VERSION = "v27.0";
const META_GRAPH_ROOT = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
const META_DIALOG_ROOT = `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth`;

export interface MetaPageCredential {
  id: string;
  name: string;
  accessToken: string;
  instagramAccount: { id: string; username: string } | null;
}

export interface MetaCredentialPayload {
  accessToken: string;
  expiresAt: string | null;
  connectedAt: string;
  pages: MetaPageCredential[];
  selectedFacebookPageId: string | null;
  selectedInstagramAccountId: string | null;
}

interface GraphErrorBody {
  error?: { message?: string; type?: string; code?: number };
}

interface GraphTokenResponse extends GraphErrorBody {
  access_token?: string;
  expires_in?: number;
}

interface GraphPage {
  id?: string;
  name?: string;
  access_token?: string;
  instagram_business_account?: { id?: string; username?: string };
}

interface GraphPagesResponse extends GraphErrorBody {
  data?: GraphPage[];
  paging?: { cursors?: { after?: string } };
}

interface GraphUserResponse extends GraphErrorBody {
  id?: string;
}

export class MetaProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MetaProviderError";
  }
}

function appId(): string {
  const value = process.env.META_APP_ID?.trim();
  if (!value) throw new MetaProviderError("Meta app setup is incomplete. Add META_APP_ID in Replit Secrets.");
  return value;
}

function appSecret(): string {
  const value = process.env.META_APP_SECRET?.trim();
  if (!value) throw new MetaProviderError("Meta app setup is incomplete. Add META_APP_SECRET in Replit Secrets.");
  return value;
}

function appSecretProof(accessToken: string): string {
  return createHmac("sha256", appSecret()).update(accessToken).digest("hex");
}

export function hashMetaUserId(userId: string): string {
  return createHash("sha256").update(userId).digest("hex");
}

export function buildMetaAuthorizationUrl(state: string, redirectUri: string): string {
  const url = new URL(META_DIALOG_ROOT);
  url.searchParams.set("client_id", appId());
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  url.searchParams.set(
    "scope",
    [
      "pages_show_list",
      "pages_read_engagement",
      "pages_manage_posts",
      "instagram_basic",
      "instagram_content_publish",
    ].join(","),
  );
  return url.toString();
}

async function graphRequest<T extends GraphErrorBody>(
  path: string,
  method: "GET" | "POST",
  values: Record<string, string>,
  accessToken?: string,
): Promise<T> {
  const url = new URL(`${META_GRAPH_ROOT}/${path.replace(/^\/+/, "")}`);
  const params = new URLSearchParams(values);
  if (accessToken) {
    params.set("access_token", accessToken);
    params.set("appsecret_proof", appSecretProof(accessToken));
  }
  const init: RequestInit =
    method === "GET"
      ? { method, signal: AbortSignal.timeout(20_000) }
      : {
          method,
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: params,
          signal: AbortSignal.timeout(20_000),
        };
  if (method === "GET") url.search = params.toString();

  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new MetaProviderError("Meta could not be reached. Try again in a moment.");
  }
  let body: T;
  try {
    body = (await response.json()) as T;
  } catch {
    throw new MetaProviderError("Meta returned an unreadable response.");
  }
  if (!response.ok || body.error) {
    const message = body.error?.message?.replace(/\s+/g, " ").slice(0, 400);
    throw new MetaProviderError(message || "Meta rejected the request. Reconnect the account and try again.");
  }
  return body;
}

export async function exchangeMetaAuthorizationCode(
  code: string,
  redirectUri: string,
): Promise<{ credentials: MetaCredentialPayload; metaUserId: string }> {
  const token = await graphRequest<GraphTokenResponse>("oauth/access_token", "GET", {
    client_id: appId(),
    client_secret: appSecret(),
    redirect_uri: redirectUri,
    code,
  });
  if (!token.access_token) {
    throw new MetaProviderError("Meta did not return an access token.");
  }
  const longLivedToken = await graphRequest<GraphTokenResponse>("oauth/access_token", "GET", {
    grant_type: "fb_exchange_token",
    client_id: appId(),
    client_secret: appSecret(),
    fb_exchange_token: token.access_token,
  });
  if (!longLivedToken.access_token) {
    throw new MetaProviderError("Meta could not create a long-lived access token.");
  }

  const [user, pages] = await Promise.all([
    graphRequest<GraphUserResponse>("me", "GET", { fields: "id" }, longLivedToken.access_token),
    loadPages(longLivedToken.access_token),
  ]);
  if (!user.id) throw new MetaProviderError("Meta did not return the authorized account identity.");

  const expiresAt =
    typeof longLivedToken.expires_in === "number"
      ? new Date(Date.now() + longLivedToken.expires_in * 1000).toISOString()
      : null;
  return {
    metaUserId: user.id,
    credentials: {
      accessToken: longLivedToken.access_token,
      expiresAt,
      connectedAt: new Date().toISOString(),
      pages,
      selectedFacebookPageId: null,
      selectedInstagramAccountId: null,
    },
  };
}

export function parseMetaCredentialPayload(
  value: Record<string, unknown>,
): MetaCredentialPayload {
  if (
    typeof value.accessToken !== "string" ||
    typeof value.connectedAt !== "string" ||
    !Array.isArray(value.pages)
  ) {
    throw new MetaProviderError("The saved Meta connection is incomplete. Reconnect Meta.");
  }
  const pages: MetaPageCredential[] = [];
  for (const candidate of value.pages) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    const page = candidate as Record<string, unknown>;
    if (
      typeof page.id !== "string" ||
      typeof page.name !== "string" ||
      typeof page.accessToken !== "string"
    ) {
      continue;
    }
    const instagram = page.instagramAccount;
    pages.push({
      id: page.id,
      name: page.name,
      accessToken: page.accessToken,
      instagramAccount:
        instagram &&
        typeof instagram === "object" &&
        !Array.isArray(instagram) &&
        typeof (instagram as Record<string, unknown>).id === "string"
          ? {
              id: (instagram as Record<string, string>).id,
              username:
                typeof (instagram as Record<string, unknown>).username === "string"
                  ? (instagram as Record<string, string>).username
                  : "Instagram account",
            }
          : null,
    });
  }
  return {
    accessToken: value.accessToken,
    connectedAt: value.connectedAt,
    expiresAt: typeof value.expiresAt === "string" ? value.expiresAt : null,
    pages,
    selectedFacebookPageId:
      typeof value.selectedFacebookPageId === "string"
        ? value.selectedFacebookPageId
        : null,
    selectedInstagramAccountId:
      typeof value.selectedInstagramAccountId === "string"
        ? value.selectedInstagramAccountId
        : null,
  };
}

async function loadPages(accessToken: string): Promise<MetaPageCredential[]> {
  const pages: MetaPageCredential[] = [];
  let after: string | undefined;
  for (let pageNumber = 0; pageNumber < 10; pageNumber += 1) {
    const values: Record<string, string> = {
      fields: "id,name,access_token,instagram_business_account{id,username}",
      limit: "100",
    };
    if (after) values.after = after;
    const response = await graphRequest<GraphPagesResponse>(
      "me/accounts",
      "GET",
      values,
      accessToken,
    );
    for (const page of response.data ?? []) {
      if (!page.id || !page.access_token) continue;
      const instagram = page.instagram_business_account;
      pages.push({
        id: page.id,
        name: page.name?.slice(0, 180) || "Facebook Page",
        accessToken: page.access_token,
        instagramAccount:
          instagram?.id
            ? {
                id: instagram.id,
                username: instagram.username?.slice(0, 180) || "Instagram account",
              }
            : null,
      });
    }
    after = response.paging?.cursors?.after;
    if (!after) break;
  }
  return pages;
}

export function verifyMetaSignedRequest(
  signedRequest: string,
): { userId: string } | null {
  const [encodedSignature, encodedPayload, extra] = signedRequest.split(".");
  if (!encodedSignature || !encodedPayload || extra !== undefined) return null;
  try {
    const signature = Buffer.from(encodedSignature, "base64url");
    const expected = createHmac("sha256", appSecret())
      .update(encodedPayload)
      .digest();
    if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) {
      return null;
    }
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as { algorithm?: string; user_id?: string | number };
    const userId = String(payload.user_id ?? "");
    if (payload.algorithm !== "HMAC-SHA256" || !/^\d{1,120}$/.test(userId)) {
      return null;
    }
    return { userId };
  } catch {
    return null;
  }
}

export async function publishFacebookPhoto(input: {
  page: MetaPageCredential;
  imageUrl: string;
  caption: string;
}): Promise<string> {
  const result = await graphRequest<{ id?: string }>(
    `${encodeURIComponent(input.page.id)}/photos`,
    "POST",
    { url: input.imageUrl, caption: input.caption },
    input.page.accessToken,
  );
  if (!result.id) throw new MetaProviderError("Facebook did not confirm the photo post.");
  return result.id;
}

export async function publishInstagramPhoto(input: {
  page: MetaPageCredential;
  imageUrl: string;
  caption: string;
}): Promise<string> {
  const instagramId = input.page.instagramAccount?.id;
  if (!instagramId) {
    throw new MetaProviderError("The selected Page no longer has a linked Instagram professional account.");
  }
  const container = await graphRequest<{ id?: string }>(
    `${encodeURIComponent(instagramId)}/media`,
    "POST",
    { image_url: input.imageUrl, caption: input.caption },
    input.page.accessToken,
  );
  if (!container.id) throw new MetaProviderError("Instagram did not create the photo container.");

  let ready = false;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const status = await graphRequest<{
      status_code?: string;
      status?: string;
    }>(
      encodeURIComponent(container.id),
      "GET",
      { fields: "status_code,status" },
      input.page.accessToken,
    );
    if (status.status_code === "FINISHED") {
      ready = true;
      break;
    }
    if (status.status_code === "ERROR" || status.status_code === "EXPIRED") {
      throw new MetaProviderError("Instagram could not prepare this photo for publishing.");
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  if (!ready) throw new MetaProviderError("Instagram is still processing the photo. Try publishing again later.");

  const published = await graphRequest<{ id?: string }>(
    `${encodeURIComponent(instagramId)}/media_publish`,
    "POST",
    { creation_id: container.id },
    input.page.accessToken,
  );
  if (!published.id) throw new MetaProviderError("Instagram did not confirm the published photo.");
  return published.id;
}

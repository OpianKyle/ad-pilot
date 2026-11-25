import { randomUUID } from "node:crypto";
import { Storage, type File } from "@google-cloud/storage";

const SIDECAR = "http://127.0.0.1:1106";

// Keep Replit's sidecar credential flow unchanged. App Storage owns media
// bytes; MySQL stores only workspace-scoped object paths and metadata.
export const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${SIDECAR}/token`,
    type: "external_account",
    credential_source: {
      url: `${SIDECAR}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

function privateDirectory(): string {
  const value = process.env.PRIVATE_OBJECT_DIR?.trim().replace(/\/+$/, "");
  if (!value) throw new Error("Private App Storage is not configured.");
  return value;
}

function parsePath(path: string): { bucket: string; objectName: string } {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const [empty, bucket, ...parts] = normalized.split("/");
  if (empty !== "" || !bucket || parts.length === 0 || parts.some((part) => !part)) {
    throw new Error("Invalid App Storage object path.");
  }
  return { bucket, objectName: parts.join("/") };
}

function fileForObjectPath(objectPath: string): File {
  if (!objectPath.startsWith("/objects/")) {
    throw new Error("Invalid App Storage object path.");
  }
  const relative = objectPath.slice("/objects/".length);
  const fullPath = `${privateDirectory()}/${relative}`;
  const parsed = parsePath(fullPath);
  return objectStorageClient.bucket(parsed.bucket).file(parsed.objectName);
}

async function signUrl(
  objectPath: string,
  method: "GET" | "PUT",
  ttlSeconds: number,
): Promise<string> {
  const file = fileForObjectPath(objectPath);
  const bucketName = file.bucket.name;
  const request = {
    bucket_name: bucketName,
    object_name: file.name,
    method,
    expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
  };
  const response = await fetch(`${SIDECAR}/object-storage/signed-object-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`App Storage could not sign an object URL (${response.status}).`);
  }
  const body: unknown = await response.json();
  if (
    !body ||
    typeof body !== "object" ||
    !("signed_url" in body) ||
    typeof body.signed_url !== "string"
  ) {
    throw new Error("App Storage returned an invalid signed URL.");
  }
  return body.signed_url;
}

export async function requestPrivateUploadUrl(
  contentType: string,
): Promise<{ uploadUrl: string; objectPath: string }> {
  const objectPath = `/objects/adpilot/uploads/${randomUUID()}`;
  return {
    uploadUrl: await signUrl(objectPath, "PUT", 15 * 60),
    objectPath,
  };
}

export async function signedPrivateReadUrl(
  objectPath: string,
  ttlSeconds = 60 * 60,
): Promise<string> {
  return signUrl(objectPath, "GET", ttlSeconds);
}

export async function readPrivateObject(objectPath: string): Promise<Buffer> {
  const [contents] = await fileForObjectPath(objectPath).download();
  return contents;
}

export async function savePrivateObject(
  objectPath: string,
  contents: Buffer,
  contentType: string,
): Promise<void> {
  await fileForObjectPath(objectPath).save(contents, {
    resumable: false,
    contentType,
    metadata: { cacheControl: "private, max-age=3600" },
  });
}

export async function deletePrivateObject(objectPath: string): Promise<void> {
  await fileForObjectPath(objectPath).delete({ ignoreNotFound: true });
}

export async function getPrivateObject(
  objectPath: string,
): Promise<{ buffer: Buffer; contentType: string }> {
  const file = fileForObjectPath(objectPath);
  const [[buffer], [metadata]] = await Promise.all([
    file.download(),
    file.getMetadata(),
  ]);
  return {
    buffer,
    contentType: typeof metadata.contentType === "string"
      ? metadata.contentType
      : "application/octet-stream",
  };
}

export function createPrivateObjectPath(kind: string, fileName: string): string {
  if (!/^[a-z][a-z0-9-]{0,24}$/.test(kind) || !/^[a-f0-9]{32}\.jpg$/.test(fileName)) {
    throw new Error("Invalid media object identifier.");
  }
  return `/objects/adpilot/${kind}/${fileName}`;
}

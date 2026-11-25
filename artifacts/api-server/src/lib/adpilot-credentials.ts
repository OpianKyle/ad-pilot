import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

function encryptionKey(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required for the credential vault.");
  return createHash("sha256")
    .update("adpilot-provider-vault-v1\0")
    .update(secret)
    .digest();
}

export function encryptProviderPayload(
  businessId: number,
  provider: string,
  value: Record<string, unknown>,
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(`${businessId}:${provider}`));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptProviderPayload(
  businessId: number,
  provider: string,
  encoded: string,
): Record<string, unknown> {
  const [version, ivValue, tagValue, ciphertextValue] = encoded.split(".");
  if (version !== "v1" || !ivValue || !tagValue || !ciphertextValue) {
    throw new Error("Stored provider credentials use an unsupported format.");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAAD(Buffer.from(`${businessId}:${provider}`));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
  const result: unknown = JSON.parse(plaintext);
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("Stored provider credentials are invalid.");
  }
  return result as Record<string, unknown>;
}

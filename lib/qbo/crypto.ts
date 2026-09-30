/**
 * At-rest encryption for QBO OAuth tokens (QboConnection.accessTokenEnc /
 * refreshTokenEnc). AES-256-GCM with a random 96-bit IV per value; the key is
 * derived from QBO_TOKEN_ENC_KEY via SHA-256 so any sufficiently-long secret
 * works. Output format: `v1.<iv>.<tag>.<ciphertext>` (base64url parts) —
 * versioned so a future scheme can coexist during rotation.
 *
 * Never log token plaintext; decrypt failures throw (a tampered or
 * wrong-key value must not silently decrypt to garbage).
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(secret, "utf8").digest();
}

function requireSecret(secret?: string): string {
  const value = secret ?? process.env.QBO_TOKEN_ENC_KEY;
  if (!value) throw new Error("QBO_TOKEN_ENC_KEY is not set");
  return value;
}

export function encryptToken(plaintext: string, secret?: string): string {
  const key = deriveKey(requireSecret(secret));
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  const b64 = (b: Buffer) => b.toString("base64url");
  return `v1.${b64(iv)}.${b64(tag)}.${b64(ciphertext)}`;
}

export function decryptToken(payload: string, secret?: string): string {
  const key = deriveKey(requireSecret(secret));
  const [version, ivB64, tagB64, dataB64] = payload.split(".");
  if (version !== "v1" || !ivB64 || !tagB64 || !dataB64) {
    throw new Error("Malformed encrypted token payload");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivB64, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

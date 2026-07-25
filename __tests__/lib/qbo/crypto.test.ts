import { describe, expect, it } from "vitest";
import { decryptToken, encryptToken } from "@/lib/qbo/crypto";

const SECRET = "test-secret-key-please-rotate";

describe("qbo token crypto", () => {
  it("round-trips a token", () => {
    const payload = encryptToken("refresh-token-value", SECRET);
    expect(payload.startsWith("v1.")).toBe(true);
    expect(payload).not.toContain("refresh-token-value");
    expect(decryptToken(payload, SECRET)).toBe("refresh-token-value");
  });

  it("produces distinct ciphertexts for the same plaintext (random IV)", () => {
    expect(encryptToken("same", SECRET)).not.toBe(encryptToken("same", SECRET));
  });

  it("throws on tamper", () => {
    const payload = encryptToken("value", SECRET);
    const parts = payload.split(".");
    parts[3] = `${parts[3].slice(0, -2)}AA`;
    expect(() => decryptToken(parts.join("."), SECRET)).toThrow();
  });

  it("throws on the wrong key", () => {
    const payload = encryptToken("value", SECRET);
    expect(() => decryptToken(payload, "another-secret")).toThrow();
  });

  it("throws on malformed payloads and a missing key", () => {
    expect(() => decryptToken("v2.a.b.c", SECRET)).toThrow("Malformed");
    expect(() => decryptToken("garbage", SECRET)).toThrow("Malformed");
    delete process.env.QBO_TOKEN_ENC_KEY;
    expect(() => encryptToken("value")).toThrow("QBO_TOKEN_ENC_KEY");
  });
});

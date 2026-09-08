import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isValidTokenShape } from "@/lib/tokens";

describe("isValidTokenShape", () => {
  it("accepts a token generated the same way the repos issue them", () => {
    const token = randomBytes(32).toString("base64url");
    expect(token).toHaveLength(43);
    expect(isValidTokenShape(token)).toBe(true);
  });

  it("accepts a well-formed 43-char base64url string", () => {
    expect(isValidTokenShape("A".repeat(43))).toBe(true);
    expect(isValidTokenShape("a1B2_-".padEnd(43, "z"))).toBe(true);
  });

  it("rejects strings shorter than 43 chars", () => {
    expect(isValidTokenShape("a".repeat(42))).toBe(false);
  });

  it("rejects strings longer than 43 chars", () => {
    expect(isValidTokenShape("a".repeat(44))).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isValidTokenShape("")).toBe(false);
  });

  it("rejects tokens with characters outside the base64url alphabet", () => {
    expect(isValidTokenShape(`${"a".repeat(42)}+`)).toBe(false);
    expect(isValidTokenShape(`${"a".repeat(42)}/`)).toBe(false);
    expect(isValidTokenShape(`${"a".repeat(42)}=`)).toBe(false);
    expect(isValidTokenShape(`${"a".repeat(42)} `)).toBe(false);
  });
});

import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { after } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { logError } from "@/lib/logger";
import { isValidTokenShape, trackPublicView } from "@/lib/tokens";

vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logError: vi.fn() }));

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

describe("trackPublicView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(headers).mockResolvedValue(
      new Headers({
        "x-forwarded-for": "192.0.2.1",
        "user-agent": "vitest",
      }) as never
    );
  });

  it("does not read request metadata or schedule work for terminal documents", async () => {
    const write = vi.fn();
    await trackPublicView(false, write, { type: "estimate", id: 42 });
    expect(headers).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it("reads metadata during render but defers the write until after the response", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    await trackPublicView(true, write, { type: "invoice", id: 7 });
    expect(headers).toHaveBeenCalledOnce();
    expect(write).not.toHaveBeenCalled();
    const run = vi.mocked(after).mock.calls[0][0];
    if (typeof run !== "function")
      throw new Error("Lifecycle callback missing");
    await run();
    expect(write).toHaveBeenCalledWith({
      ip: "192.0.2.1",
      userAgent: "vitest",
    });
    expect(headers).toHaveBeenCalledOnce();
    expect(logError).not.toHaveBeenCalled();
  });

  it.each([
    "estimate",
    "invoice",
  ] as const)("logs %s write failures without rejecting the lifecycle callback", async (type) => {
    const err = new Error("pool exhausted");
    await trackPublicView(true, vi.fn().mockRejectedValue(err), {
      type,
      id: 42,
    });
    const run = vi.mocked(after).mock.calls[0][0];
    if (typeof run !== "function")
      throw new Error("Lifecycle callback missing");
    await expect(run()).resolves.toBeUndefined();
    expect(logError).toHaveBeenCalledWith({
      path: `/${type}-review`,
      errorMessage: `mark-viewed write failed for ${type} 42`,
      err,
    });
  });
});

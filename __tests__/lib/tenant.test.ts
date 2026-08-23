import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnauthorizedError } from "@/lib/api/errors";

/**
 * Direct tests for lib/tenant.ts — the multi-tenancy gate every API route
 * calls through (`getOrgId`) and the auth gate some routes use directly
 * (`requireSession`). Only `auth()` itself is mocked; the throw/return logic
 * under test is the real implementation, not a re-mocked stub.
 */

const auth = vi.fn();

vi.mock("@/lib/auth", () => ({
  auth,
}));

const { getOrgId, requireSession } = await import("@/lib/tenant");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getOrgId", () => {
  it("returns the org id from the session", async () => {
    auth.mockResolvedValue({ user: { orgId: "org1", role: "admin" } });

    await expect(getOrgId()).resolves.toBe("org1");
  });

  it("throws UnauthorizedError when there is no session", async () => {
    auth.mockResolvedValue(null);

    await expect(getOrgId()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("throws UnauthorizedError when the session has no user", async () => {
    auth.mockResolvedValue({ user: undefined });

    await expect(getOrgId()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("throws UnauthorizedError when the session's user has no orgId", async () => {
    auth.mockResolvedValue({ user: { orgId: "", role: "admin" } });

    await expect(getOrgId()).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe("requireSession", () => {
  it("returns the full session when present", async () => {
    const session = { user: { orgId: "org1", role: "admin", id: "user1" } };
    auth.mockResolvedValue(session);

    await expect(requireSession()).resolves.toBe(session);
  });

  it("throws UnauthorizedError when there is no session", async () => {
    auth.mockResolvedValue(null);

    await expect(requireSession()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("throws UnauthorizedError when the session has no user", async () => {
    auth.mockResolvedValue({ user: null });

    await expect(requireSession()).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

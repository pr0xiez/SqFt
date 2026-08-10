import type { NextAuthConfig } from "next-auth";
import { beforeEach, describe, expect, it, vi } from "vitest";

const findAuthState = vi.fn();
vi.mock("@/lib/repositories/userRepo", () => ({ findAuthState }));

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@auth/prisma-adapter", () => ({ PrismaAdapter: vi.fn(() => ({})) }));
vi.mock("next-auth/providers/credentials", () => ({
  default: vi.fn(() => ({})),
}));

let capturedConfig: NextAuthConfig | undefined;
vi.mock("next-auth", () => ({
  default: vi.fn((config: NextAuthConfig) => {
    capturedConfig = config;
    return { handlers: {}, signIn: vi.fn(), signOut: vi.fn(), auth: vi.fn() };
  }),
}));

await import("@/lib/auth");

function jwtCallback() {
  const jwt = capturedConfig?.callbacks?.jwt;
  if (!jwt) throw new Error("jwt callback not captured");
  // biome-ignore lint/suspicious/noExplicitAny: exercising the real callback with minimal params
  return jwt as (args: any) => Promise<any>;
}

beforeEach(() => {
  findAuthState.mockReset();
});

describe("lib/auth jwt callback", () => {
  it("bakes orgId/role from `user` at sign-in without hitting the DB", async () => {
    const token = await jwtCallback()({
      token: { sub: "u1" },
      user: { orgId: "org1", role: "admin" },
    });

    expect(token).toEqual({ sub: "u1", orgId: "org1", role: "admin" });
    expect(findAuthState).not.toHaveBeenCalled();
  });

  it("re-validates against the DB on subsequent requests and keeps an active user's session alive", async () => {
    findAuthState.mockResolvedValue({
      orgId: "org1",
      role: "lead",
      archived: false,
    });

    const token = await jwtCallback()({
      token: { sub: "u1", orgId: "org1", role: "lead" },
      user: undefined,
    });

    expect(findAuthState).toHaveBeenCalledWith("u1");
    expect(token).toEqual({ sub: "u1", orgId: "org1", role: "lead" });
  });

  it("propagates a role change (e.g. admin demoted to crew) onto the live token", async () => {
    findAuthState.mockResolvedValue({
      orgId: "org1",
      role: "crew",
      archived: false,
    });

    const token = await jwtCallback()({
      token: { sub: "u1", orgId: "org1", role: "admin" },
      user: undefined,
    });

    expect(token.role).toBe("crew");
  });

  it("propagates a role promotion onto the live token", async () => {
    findAuthState.mockResolvedValue({
      orgId: "org1",
      role: "admin",
      archived: false,
    });

    const token = await jwtCallback()({
      token: { sub: "u1", orgId: "org1", role: "crew" },
      user: undefined,
    });

    expect(token.role).toBe("admin");
  });

  it("propagates an orgId change onto the live token", async () => {
    findAuthState.mockResolvedValue({
      orgId: "org2",
      role: "lead",
      archived: false,
    });

    const token = await jwtCallback()({
      token: { sub: "u1", orgId: "org1", role: "lead" },
      user: undefined,
    });

    expect(token.orgId).toBe("org2");
  });

  it("invalidates the session (returns null) when the user has been archived", async () => {
    findAuthState.mockResolvedValue({
      orgId: "org1",
      role: "admin",
      archived: true,
    });

    const token = await jwtCallback()({
      token: { sub: "u1", orgId: "org1", role: "admin" },
      user: undefined,
    });

    expect(token).toBeNull();
  });

  it("invalidates the session (returns null) when the user no longer exists", async () => {
    findAuthState.mockResolvedValue(null);

    const token = await jwtCallback()({
      token: { sub: "u1", orgId: "org1", role: "admin" },
      user: undefined,
    });

    expect(token).toBeNull();
  });

  it("leaves the token untouched when it has no sub (no id to re-validate)", async () => {
    const token = await jwtCallback()({
      token: { orgId: "org1", role: "admin" },
      user: undefined,
    });

    expect(findAuthState).not.toHaveBeenCalled();
    expect(token).toEqual({ orgId: "org1", role: "admin" });
  });
});

describe("lib/auth session config", () => {
  it("sets an explicit session.maxAge shorter than the 30-day default", () => {
    expect(capturedConfig?.session?.strategy).toBe("jwt");
    expect(capturedConfig?.session?.maxAge).toBe(60 * 60 * 24 * 7);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Direct tests for the NextAuth authorization boundary:
 * `authorizeCredentials` (lib/auth/authorize.ts — the Credentials
 * provider's `authorize` body) and `mapTokenToSessionFields`
 * (lib/auth/session.ts — the `session` callback's token→session mapping).
 *
 * Both live in their own next-auth-free modules, imported and delegated to
 * by lib/auth.ts's NextAuth config, precisely so this suite can import and
 * exercise the real logic — bad password, archived user, malformed JWT —
 * without booting NextAuth (which pulls in "next/server" and can't run
 * under vitest) and without re-mocking the thing under test.
 */

const findUnique = vi.fn();
const updateMany = vi.fn();
const executeRaw = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique, updateMany },
    $executeRaw: executeRaw,
  },
}));

const compare = vi.fn();

vi.mock("bcryptjs", () => ({
  default: {
    compare,
  },
}));

const { authorizeCredentials } = await import("@/lib/auth/authorize");
const { mapTokenToSessionFields } = await import("@/lib/auth/session");

beforeEach(() => {
  vi.clearAllMocks();
  updateMany.mockResolvedValue({ count: 1 });
});

const dbUser = {
  id: "user1",
  name: "Alice Admin",
  email: "alice@example.com",
  password: "hashed-password",
  role: "admin",
  title: null,
  archived: false,
  orgId: "org1",
  createdAt: new Date(),
  failedLoginCount: 0,
  lockedUntil: null,
};

describe("authorizeCredentials", () => {
  it("returns the user object for valid credentials", async () => {
    findUnique.mockResolvedValue(dbUser);
    compare.mockResolvedValue(true);

    const result = await authorizeCredentials({
      email: "alice@example.com",
      password: "correct-password",
    });

    expect(result).toEqual({
      id: "user1",
      name: "Alice Admin",
      email: "alice@example.com",
      orgId: "org1",
      role: "admin",
    });
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: "alice@example.com" },
      })
    );
    expect(compare).toHaveBeenCalledWith("correct-password", "hashed-password");
  });

  it("returns null for an archived user after a dummy password comparison", async () => {
    findUnique.mockResolvedValue({ ...dbUser, archived: true });

    const result = await authorizeCredentials({
      email: "alice@example.com",
      password: "correct-password",
    });

    expect(result).toBeNull();
    expect(compare).toHaveBeenCalledTimes(1);
    expect(compare.mock.calls[0]?.[1]).not.toBe(dbUser.password);
  });

  it("returns null for an unknown email", async () => {
    findUnique.mockResolvedValue(null);

    const result = await authorizeCredentials({
      email: "nobody@example.com",
      password: "whatever1",
    });

    expect(result).toBeNull();
    expect(compare).toHaveBeenCalledTimes(1);
  });

  it("returns null for a wrong password", async () => {
    findUnique.mockResolvedValue(dbUser);
    compare.mockResolvedValue(false);

    const result = await authorizeCredentials({
      email: "alice@example.com",
      password: "wrong-password",
    });

    expect(result).toBeNull();
  });

  it("returns null for malformed credentials without hitting the db", async () => {
    const result = await authorizeCredentials({
      email: "not-an-email",
      password: "short",
    });

    expect(result).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
    expect(compare).not.toHaveBeenCalled();
  });

  it("returns null when credentials are missing entirely", async () => {
    const result = await authorizeCredentials(undefined);

    expect(result).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });
});

describe("mapTokenToSessionFields", () => {
  it("throws when orgId is not a string", () => {
    expect(() =>
      mapTokenToSessionFields({ sub: "user1", orgId: 123, role: "admin" })
    ).toThrow(/Malformed JWT/);
  });

  it("throws when role is not a string", () => {
    expect(() =>
      mapTokenToSessionFields({ sub: "user1", orgId: "org1", role: null })
    ).toThrow(/Malformed JWT/);
  });

  it("throws when both orgId and role are missing", () => {
    expect(() => mapTokenToSessionFields({ sub: "user1" })).toThrow(
      /Malformed JWT/
    );
  });

  it("propagates orgId, role, and sub for a well-formed token", () => {
    const result = mapTokenToSessionFields({
      sub: "user1",
      orgId: "org1",
      role: "lead",
    });

    expect(result).toEqual({ id: "user1", orgId: "org1", role: "lead" });
  });

  it("falls back to an empty id when sub is absent", () => {
    const result = mapTokenToSessionFields({ orgId: "org1", role: "crew" });

    expect(result).toEqual({ id: "", orgId: "org1", role: "crew" });
  });
});

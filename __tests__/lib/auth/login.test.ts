import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import {
  authenticateCredentials,
  LOCKOUT_WINDOW_MS,
  MAX_FAILED_LOGIN_ATTEMPTS,
} from "@/lib/auth/login";
import { prisma } from "@/lib/prisma";

const mockFindUnique = vi.mocked(prisma.user.findUnique);
const mockUpdate = vi.mocked(prisma.user.update);

const PASSWORD = "correct horse battery staple";
let PASSWORD_HASH: string;

function baseUser(overrides: Partial<Record<string, unknown>> = {}) {
  const user = {
    id: "u1",
    name: "Ada",
    email: "ada@example.dev",
    password: PASSWORD_HASH,
    orgId: "org1",
    role: "admin",
    archived: false,
    failedLoginCount: 0,
    lockedUntil: null,
    ...overrides,
  };
  // biome-ignore lint/suspicious/noExplicitAny: test stub, narrower than Prisma's row type
  return user as any;
}

beforeEach(async () => {
  vi.clearAllMocks();
  PASSWORD_HASH = await bcrypt.hash(PASSWORD, 10);
});

describe("authenticateCredentials", () => {
  it("returns null when no user matches the email (no enumeration side channel)", async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    const result = await authenticateCredentials(
      "nobody@example.dev",
      PASSWORD
    );
    expect(result).toBeNull();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns null for an archived user without touching bcrypt/update", async () => {
    mockFindUnique.mockResolvedValueOnce(baseUser({ archived: true }));
    const result = await authenticateCredentials("ada@example.dev", PASSWORD);
    expect(result).toBeNull();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("successful login returns the user and resets counters when they were dirty", async () => {
    mockFindUnique.mockResolvedValueOnce(baseUser({ failedLoginCount: 2 }));
    const result = await authenticateCredentials("ada@example.dev", PASSWORD);
    expect(result).toMatchObject({
      id: "u1",
      email: "ada@example.dev",
      orgId: "org1",
      role: "admin",
    });
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { failedLoginCount: 0, lockedUntil: null },
    });
  });

  it("successful login skips the reset write when counters are already clean", async () => {
    mockFindUnique.mockResolvedValueOnce(baseUser());
    const result = await authenticateCredentials("ada@example.dev", PASSWORD);
    expect(result).not.toBeNull();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("wrong password increments failedLoginCount and returns null", async () => {
    mockFindUnique.mockResolvedValueOnce(baseUser({ failedLoginCount: 1 }));
    const result = await authenticateCredentials(
      "ada@example.dev",
      "wrong-password"
    );
    expect(result).toBeNull();
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { failedLoginCount: 2 },
    });
  });

  it(`locks the account after ${MAX_FAILED_LOGIN_ATTEMPTS} consecutive failures`, async () => {
    mockFindUnique.mockResolvedValueOnce(
      baseUser({ failedLoginCount: MAX_FAILED_LOGIN_ATTEMPTS - 1 })
    );
    const before = Date.now();
    const result = await authenticateCredentials(
      "ada@example.dev",
      "wrong-password"
    );
    expect(result).toBeNull();
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const call = mockUpdate.mock.calls[0]?.[0] as {
      where: { id: string };
      data: { failedLoginCount: number; lockedUntil: Date };
    };
    expect(call.where).toEqual({ id: "u1" });
    expect(call.data.failedLoginCount).toBe(MAX_FAILED_LOGIN_ATTEMPTS);
    expect(call.data.lockedUntil.getTime()).toBeGreaterThanOrEqual(
      before + LOCKOUT_WINDOW_MS
    );
  });

  it("a locked account rejects even the correct password, without calling update", async () => {
    const lockedUntil = new Date(Date.now() + LOCKOUT_WINDOW_MS);
    mockFindUnique.mockResolvedValueOnce(
      baseUser({
        failedLoginCount: MAX_FAILED_LOGIN_ATTEMPTS,
        lockedUntil,
      })
    );
    const result = await authenticateCredentials("ada@example.dev", PASSWORD);
    expect(result).toBeNull();
    // No write at all: rejected before bcrypt/update ever run.
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("allows retry with the correct password once the lockout window has expired", async () => {
    const expiredLockedUntil = new Date(Date.now() - 1000); // just expired
    mockFindUnique.mockResolvedValueOnce(
      baseUser({
        failedLoginCount: MAX_FAILED_LOGIN_ATTEMPTS,
        lockedUntil: expiredLockedUntil,
      })
    );
    const result = await authenticateCredentials("ada@example.dev", PASSWORD);
    expect(result).not.toBeNull();
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { failedLoginCount: 0, lockedUntil: null },
    });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    qboConnection: { findUnique: db.findUnique, updateMany: db.updateMany },
    $transaction: db.transaction,
  },
}));
vi.mock("@/lib/qbo/config", () => ({
  getQboConfig: () => ({ apiBaseUrl: "https://qbo.example" }),
}));
vi.mock("@/lib/qbo/crypto", () => ({
  encryptToken: (v: string) => `enc:${v}`,
  decryptToken: (v: string) => v.slice(4),
}));

import { getFreshAccessContext } from "@/lib/repositories/qboRepo";

const original = {
  id: "conn",
  orgId: "org",
  realmId: "realm",
  status: "active",
  accessTokenEnc: "enc:old-access",
  refreshTokenEnc: "enc:old-refresh",
  accessTokenExpiresAt: new Date(0),
};
beforeEach(() => {
  vi.resetAllMocks();
  db.findUnique.mockResolvedValue(original);
  db.transaction.mockImplementation(
    async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        $queryRaw: async () => [original],
        qboConnection: {
          update: async () => {
            throw new Error("commit failed");
          },
        },
      })
  );
});
describe("rotated grant recovery", () => {
  const exchange = async () => ({
    accessToken: "rotated-access",
    refreshToken: "rotated-refresh",
    expiresIn: 3600,
    refreshExpiresIn: 86400,
  });
  it("salvages only if the same active realm still holds the pre-exchange pair", async () => {
    db.updateMany.mockResolvedValue({ count: 1 });
    expect(await getFreshAccessContext("org", { exchange })).toMatchObject({
      accessToken: "rotated-access",
      realmId: "realm",
    });
    expect(db.updateMany.mock.calls[0][0].where).toEqual({
      id: "conn",
      status: "active",
      realmId: "realm",
      accessTokenEnc: "enc:old-access",
      refreshTokenEnc: "enc:old-refresh",
    });
  });
  it("uses a newer committed grant when the salvage fence loses", async () => {
    db.updateMany.mockResolvedValue({ count: 0 });
    db.findUnique.mockResolvedValueOnce(original).mockResolvedValue({
      ...original,
      accessTokenEnc: "enc:newer-access",
      refreshTokenEnc: "enc:newer-refresh",
      accessTokenExpiresAt: new Date(Date.now() + 3600000),
    });
    expect(await getFreshAccessContext("org", { exchange })).toMatchObject({
      accessToken: "newer-access",
    });
    expect(db.updateMany).toHaveBeenCalledTimes(1);
  });
  it("cannot resurrect an intentionally disconnected connection", async () => {
    db.updateMany.mockResolvedValue({ count: 0 });
    db.findUnique
      .mockResolvedValueOnce(original)
      .mockResolvedValue({ ...original, status: "revoked" });
    expect(await getFreshAccessContext("org", { exchange })).toBeNull();
  });
});

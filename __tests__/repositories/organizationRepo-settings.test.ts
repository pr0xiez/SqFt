import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
const update = vi.fn();
const findMany = vi.fn();
const count = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    organization: { findUnique, update, findMany, count },
  },
}));

const {
  getOrgSettings,
  updateOrgSettings,
  listAllOrgsForAdmin,
  countOrgsForAdmin,
} = await import("@/lib/repositories/organizationRepo");

beforeEach(() => vi.clearAllMocks());

describe("getOrgSettings", () => {
  it("returns null when the org isn't found", async () => {
    findUnique.mockResolvedValue(null);
    expect(await getOrgSettings("org1")).toBeNull();
  });

  it("scopes the read by orgId", async () => {
    findUnique.mockResolvedValue({ id: "org1", name: "Acme" });
    await getOrgSettings("org1");
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "org1" } })
    );
  });
});

describe("updateOrgSettings", () => {
  it("scopes the write to the caller's own org", async () => {
    update.mockResolvedValue({ id: "org1", name: "Updated" });
    const result = await updateOrgSettings("org1", { name: "Updated" });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "org1" },
        data: { name: "Updated" },
      })
    );
    expect(result).toEqual({ id: "org1", name: "Updated" });
  });
});

describe("listAllOrgsForAdmin bounds", () => {
  it("caps at MAX_LIST_ROWS by default and clamps oversized take", async () => {
    findMany.mockResolvedValue([]);
    await listAllOrgsForAdmin();
    expect(findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ take: 500 })
    );
    await listAllOrgsForAdmin({ take: 99999, skip: 10 });
    expect(findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ take: 500, skip: 10 })
    );
  });
});

describe("listAllOrgsForAdmin", () => {
  it("is not org-scoped — lists every org, mapping _count.users to userCount", async () => {
    findMany.mockResolvedValue([
      {
        id: "org1",
        name: "Acme",
        slug: "acme",
        subscriptionStatus: "manual",
        trialEndsAt: null,
        currentPeriodEndsAt: null,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        _count: { users: 3 },
      },
      {
        id: "org2",
        name: "Pinecrest",
        slug: "pinecrest",
        subscriptionStatus: "trialing",
        trialEndsAt: new Date("2026-02-01T00:00:00Z"),
        currentPeriodEndsAt: new Date("2026-03-01T00:00:00Z"),
        createdAt: new Date("2026-01-05T00:00:00Z"),
        _count: { users: 1 },
      },
    ]);
    const rows = await listAllOrgsForAdmin();
    expect(findMany).toHaveBeenCalledWith(
      expect.not.objectContaining({ where: expect.anything() })
    );
    expect(rows).toEqual([
      {
        id: "org1",
        name: "Acme",
        slug: "acme",
        subscriptionStatus: "manual",
        trialEndsAt: null,
        currentPeriodEndsAt: null,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        userCount: 3,
      },
      {
        id: "org2",
        name: "Pinecrest",
        slug: "pinecrest",
        subscriptionStatus: "trialing",
        trialEndsAt: new Date("2026-02-01T00:00:00Z"),
        currentPeriodEndsAt: new Date("2026-03-01T00:00:00Z"),
        createdAt: new Date("2026-01-05T00:00:00Z"),
        userCount: 1,
      },
    ]);
  });
});

describe("countOrgsForAdmin", () => {
  it("returns the platform-wide org count with no where filter", async () => {
    count.mockResolvedValue(7);
    expect(await countOrgsForAdmin()).toBe(7);
    expect(count).toHaveBeenCalledWith();
  });
});

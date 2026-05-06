import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();
const findFirst = vi.fn();
const create = vi.fn();
const updateMany = vi.fn();
const deleteMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    customer: { findMany, findFirst, create, updateMany, deleteMany },
  },
}));

const {
  listCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer,
} = await import("@/lib/repositories/customerRepo");

beforeEach(() => vi.clearAllMocks());

describe("listCustomers", () => {
  it("queries by orgId with count include", async () => {
    findMany.mockResolvedValue([]);
    await listCustomers("org1");
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orgId: "org1" } })
    );
  });
});

describe("getCustomer", () => {
  it("returns null when not found", async () => {
    findFirst.mockResolvedValue(null);
    expect(await getCustomer(99, "org1")).toBeNull();
  });

  it("scopes query by both id and orgId", async () => {
    findFirst.mockResolvedValue({ id: 1 });
    await getCustomer(1, "org1");
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1, orgId: "org1" } })
    );
  });
});

describe("createCustomer", () => {
  it("injects orgId into created record", async () => {
    create.mockResolvedValue({ id: 1 });
    await createCustomer("org1", { name: "Alice", source: "phone" });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ orgId: "org1" }),
      })
    );
  });
});

describe("updateCustomer", () => {
  it("returns null when record not found in org", async () => {
    updateMany.mockResolvedValue({ count: 0 });
    expect(await updateCustomer(99, "org1", { name: "X" })).toBeNull();
  });

  it("returns the updated customer on success", async () => {
    updateMany.mockResolvedValue({ count: 1 });
    findFirst.mockResolvedValue({ id: 1, name: "Updated" });
    const result = await updateCustomer(1, "org1", { name: "Updated" });
    expect(result).toEqual({ id: 1, name: "Updated" });
  });
});

describe("deleteCustomer", () => {
  it("returns false when nothing was deleted", async () => {
    deleteMany.mockResolvedValue({ count: 0 });
    expect(await deleteCustomer(99, "org1")).toBe(false);
  });

  it("returns true when deleted", async () => {
    deleteMany.mockResolvedValue({ count: 1 });
    expect(await deleteCustomer(1, "org1")).toBe(true);
  });
});

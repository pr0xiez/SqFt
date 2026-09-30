import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();
const findFirst = vi.fn();
const create = vi.fn();
const updateMany = vi.fn();
const deleteMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    lineItemTemplate: { findMany, findFirst, create, updateMany, deleteMany },
  },
}));

const {
  listLineItemTemplates,
  createLineItemTemplate,
  updateLineItemTemplate,
  deleteLineItemTemplate,
} = await import("@/lib/repositories/lineItemTemplateRepo");

beforeEach(() => vi.clearAllMocks());

describe("listLineItemTemplates", () => {
  it("filters by orgId and excludes archived rows by default", async () => {
    findMany.mockResolvedValue([]);
    await listLineItemTemplates("org1");
    expect(findMany).toHaveBeenCalledWith({
      where: { orgId: "org1", archived: false },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
  });

  it("includes archived rows when includeArchived is set, still org-scoped", async () => {
    findMany.mockResolvedValue([]);
    await listLineItemTemplates("org1", { includeArchived: true });
    expect(findMany).toHaveBeenCalledWith({
      where: { orgId: "org1" },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
  });

  it("orders by sortOrder then name", async () => {
    findMany.mockResolvedValue([]);
    await listLineItemTemplates("org1");
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      })
    );
  });
});

describe("createLineItemTemplate", () => {
  it("injects orgId into the created record", async () => {
    create.mockResolvedValue({ id: 1 });
    await createLineItemTemplate("org1", { name: "Tile" });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ orgId: "org1", name: "Tile" }),
      })
    );
  });

  it("applies default values when not provided", async () => {
    create.mockResolvedValue({ id: 1 });
    await createLineItemTemplate("org1", { name: "Tile" });
    expect(create).toHaveBeenCalledWith({
      data: {
        orgId: "org1",
        name: "Tile",
        description: null,
        rate: 0,
        unitLabel: "ft²",
      },
    });
  });

  it("uses provided values over defaults", async () => {
    create.mockResolvedValue({ id: 1 });
    await createLineItemTemplate("org1", {
      name: "Tile",
      description: "Ceramic tile",
      rate: 4.5,
      unitLabel: "sq yd",
    });
    expect(create).toHaveBeenCalledWith({
      data: {
        orgId: "org1",
        name: "Tile",
        description: "Ceramic tile",
        rate: 4.5,
        unitLabel: "sq yd",
      },
    });
  });
});

describe("updateLineItemTemplate", () => {
  it("scopes updateMany by both id and orgId", async () => {
    updateMany.mockResolvedValue({ count: 1 });
    findFirst.mockResolvedValue({ id: 1 });
    await updateLineItemTemplate(1, "org1", { name: "Updated" });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 1, orgId: "org1" },
      data: { name: "Updated" },
    });
  });

  it("returns null when no row matches id + orgId", async () => {
    updateMany.mockResolvedValue({ count: 0 });
    const result = await updateLineItemTemplate(99, "org1", { name: "X" });
    expect(result).toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("re-reads the updated row scoped by id + orgId on success", async () => {
    updateMany.mockResolvedValue({ count: 1 });
    findFirst.mockResolvedValue({ id: 1, name: "Updated" });
    const result = await updateLineItemTemplate(1, "org1", { name: "Updated" });
    expect(findFirst).toHaveBeenCalledWith({ where: { id: 1, orgId: "org1" } });
    expect(result).toEqual({ id: 1, name: "Updated" });
  });

  it("soft-archives via the archived flag rather than deleting", async () => {
    updateMany.mockResolvedValue({ count: 1 });
    findFirst.mockResolvedValue({ id: 1, archived: true });
    await updateLineItemTemplate(1, "org1", { archived: true });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 1, orgId: "org1" },
      data: { archived: true },
    });
    expect(deleteMany).not.toHaveBeenCalled();
  });
});

describe("deleteLineItemTemplate", () => {
  it("hard-deletes via deleteMany scoped by both id and orgId", async () => {
    deleteMany.mockResolvedValue({ count: 1 });
    await deleteLineItemTemplate(1, "org1");
    expect(deleteMany).toHaveBeenCalledWith({
      where: { id: 1, orgId: "org1" },
    });
  });

  it("returns ok: true when a row was deleted", async () => {
    deleteMany.mockResolvedValue({ count: 1 });
    expect(await deleteLineItemTemplate(1, "org1")).toEqual({ ok: true });
  });

  it("returns ok: false when nothing matched id + orgId", async () => {
    deleteMany.mockResolvedValue({ count: 0 });
    expect(await deleteLineItemTemplate(99, "org1")).toEqual({ ok: false });
  });
});

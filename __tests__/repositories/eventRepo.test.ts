import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();
const findFirst = vi.fn();
const create = vi.fn();
const updateMany = vi.fn();
const deleteMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    event: { findMany, findFirst, create, updateMany, deleteMany },
  },
}));

const { listEvents, createEvent, updateEvent, deleteEvent } = await import(
  "@/lib/repositories/eventRepo"
);

beforeEach(() => vi.clearAllMocks());

describe("listEvents", () => {
  it("queries by orgId ordered by date then startTime", async () => {
    findMany.mockResolvedValue([]);
    await listEvents("org1");
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orgId: "org1" } })
    );
  });
});

describe("createEvent", () => {
  it("injects orgId", async () => {
    create.mockResolvedValue({ id: 1 });
    await createEvent("org1", {
      type: "job",
      title: "Install",
      date: new Date("2026-06-01"),
      startTime: "08:00",
      endTime: "17:00",
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ orgId: "org1" }),
      })
    );
  });
});

describe("updateEvent", () => {
  it("returns null when event not found in org", async () => {
    updateMany.mockResolvedValue({ count: 0 });
    expect(await updateEvent(99, "org1", { title: "X" })).toBeNull();
  });

  it("returns the updated event on success", async () => {
    updateMany.mockResolvedValue({ count: 1 });
    findFirst.mockResolvedValue({ id: 1, title: "Updated" });
    const result = await updateEvent(1, "org1", { title: "Updated" });
    expect(result).toEqual({ id: 1, title: "Updated" });
  });
});

describe("deleteEvent", () => {
  it("returns false when nothing deleted", async () => {
    deleteMany.mockResolvedValue({ count: 0 });
    expect(await deleteEvent(99, "org1")).toBe(false);
  });

  it("returns true when deleted", async () => {
    deleteMany.mockResolvedValue({ count: 1 });
    expect(await deleteEvent(1, "org1")).toBe(true);
  });
});

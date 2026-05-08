import { beforeEach, describe, expect, it, vi } from "vitest";

const eventFindMany = vi.fn();
const eventFindFirst = vi.fn();
const eventCreate = vi.fn();
const eventUpdateMany = vi.fn();
const eventDeleteMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    event: {
      findMany: eventFindMany,
      findFirst: eventFindFirst,
      create: eventCreate,
      updateMany: eventUpdateMany,
      deleteMany: eventDeleteMany,
    },
  },
}));

const {
  listEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  EventValidationError,
} = await import("@/lib/repositories/eventRepo");

beforeEach(() => vi.clearAllMocks());

describe("listEvents", () => {
  it("scopes by orgId and orders by date,startTime", async () => {
    eventFindMany.mockResolvedValue([]);
    await listEvents("org1");
    expect(eventFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId: "org1" },
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
      })
    );
  });
});

describe("createEvent", () => {
  it("creates a visit without a quoteId", async () => {
    eventCreate.mockResolvedValue({ id: 1 });
    await createEvent("org1", {
      type: "visit",
      title: "Measure",
      date: new Date(),
      startTime: "10:00",
      endTime: "11:00",
    });
    expect(eventCreate).toHaveBeenCalled();
  });

  it("creates a job when quoteId is present", async () => {
    eventCreate.mockResolvedValue({ id: 1 });
    await createEvent("org1", {
      type: "job",
      title: "Install",
      quoteId: 42,
      date: new Date(),
      startTime: "08:00",
      endTime: "16:00",
    });
    expect(eventCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ orgId: "org1", quoteId: 42 }),
    });
  });

  it("rejects a job without a quoteId", async () => {
    await expect(
      createEvent("org1", {
        type: "job",
        title: "Install",
        date: new Date(),
        startTime: "08:00",
        endTime: "16:00",
      })
    ).rejects.toBeInstanceOf(EventValidationError);
    expect(eventCreate).not.toHaveBeenCalled();
  });
});

describe("updateEvent", () => {
  it("returns null when the event isn't found", async () => {
    eventFindFirst.mockResolvedValueOnce(null);
    expect(await updateEvent(99, "org1", { title: "x" })).toBeNull();
  });

  it("rejects when changing an existing job's quoteId to null", async () => {
    eventFindFirst.mockResolvedValueOnce({ type: "job", quoteId: 1 });
    await expect(
      updateEvent(1, "org1", { quoteId: null })
    ).rejects.toBeInstanceOf(EventValidationError);
  });

  it("rejects when changing a visit's type to job without supplying a quoteId", async () => {
    eventFindFirst.mockResolvedValueOnce({ type: "visit", quoteId: null });
    await expect(
      updateEvent(1, "org1", { type: "job" })
    ).rejects.toBeInstanceOf(EventValidationError);
  });

  it("allows changing a job's quoteId to another quote", async () => {
    eventFindFirst
      .mockResolvedValueOnce({ type: "job", quoteId: 1 })
      .mockResolvedValueOnce({ id: 1 });
    eventUpdateMany.mockResolvedValue({ count: 1 });
    await updateEvent(1, "org1", { quoteId: 2 });
    expect(eventUpdateMany).toHaveBeenCalled();
  });
});

describe("deleteEvent", () => {
  it("returns true when something was deleted", async () => {
    eventDeleteMany.mockResolvedValue({ count: 1 });
    expect(await deleteEvent(1, "org1")).toBe(true);
  });
});

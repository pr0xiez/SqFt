import { beforeEach, describe, expect, it, vi } from "vitest";
import { ValidationError } from "@/lib/api/errors";

const eventFindMany = vi.fn();
const eventFindFirst = vi.fn();
const eventCreate = vi.fn();
const eventUpdate = vi.fn();
const eventDeleteMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    event: {
      findMany: eventFindMany,
      findFirst: eventFindFirst,
      create: eventCreate,
      update: eventUpdate,
      deleteMany: eventDeleteMany,
    },
  },
}));

const { listEvents, createEvent, updateEvent, deleteEvent } = await import(
  "@/lib/repositories/eventRepo"
);

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
    expect(eventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ orgId: "org1", quoteId: 42 }),
      })
    );
  });

  it("connects crewMembers when crewMemberIds is supplied", async () => {
    eventCreate.mockResolvedValue({ id: 1 });
    await createEvent("org1", {
      type: "visit",
      title: "Measure",
      date: new Date(),
      startTime: "10:00",
      endTime: "11:00",
      crewMemberIds: [10, 11],
    });
    expect(eventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          crewMembers: { connect: [{ id: 10 }, { id: 11 }] },
        }),
      })
    );
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
    ).rejects.toBeInstanceOf(ValidationError);
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
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects when changing a visit's type to job without supplying a quoteId", async () => {
    eventFindFirst.mockResolvedValueOnce({ type: "visit", quoteId: null });
    await expect(
      updateEvent(1, "org1", { type: "job" })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("allows changing a job's quoteId to another quote", async () => {
    eventFindFirst.mockResolvedValueOnce({ type: "job", quoteId: 1 });
    eventUpdate.mockResolvedValue({ id: 1 });
    await updateEvent(1, "org1", { quoteId: 2 });
    expect(eventUpdate).toHaveBeenCalled();
  });

  it("uses set semantics when crewMemberIds is supplied", async () => {
    eventFindFirst.mockResolvedValueOnce({ type: "visit", quoteId: null });
    eventUpdate.mockResolvedValue({ id: 1 });
    await updateEvent(1, "org1", { crewMemberIds: [10] });
    expect(eventUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: expect.objectContaining({
          crewMembers: { set: [{ id: 10 }] },
        }),
      })
    );
  });
});

describe("deleteEvent", () => {
  it("returns true when something was deleted", async () => {
    eventDeleteMany.mockResolvedValue({ count: 1 });
    expect(await deleteEvent(1, "org1")).toBe(true);
  });
});

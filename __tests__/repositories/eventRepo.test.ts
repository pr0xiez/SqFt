import { beforeEach, describe, expect, it, vi } from "vitest";
import { ValidationError } from "@/lib/api/errors";

const eventFindMany = vi.fn();
const eventFindFirst = vi.fn();
const eventCreate = vi.fn();
const eventUpdate = vi.fn();
const eventDeleteMany = vi.fn();
const customerFindFirst = vi.fn();
const estimateFindFirst = vi.fn();
const validateUserIds = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    event: {
      findMany: eventFindMany,
      findFirst: eventFindFirst,
      create: eventCreate,
      update: eventUpdate,
      deleteMany: eventDeleteMany,
    },
    customer: { findFirst: customerFindFirst },
    estimate: { findFirst: estimateFindFirst },
  },
}));

// eventRepo enforces assignee org-membership itself (see assertAssigneesInOrg)
// via userRepo's validateUserIds — mocked here the same way customer/estimate
// FK lookups are, so createEvent/updateEvent's org check is exercised without
// a real DB.
vi.mock("@/lib/repositories/userRepo", () => ({ validateUserIds }));

const { listEvents, createEvent, updateEvent, deleteEvent } = await import(
  "@/lib/repositories/eventRepo"
);

beforeEach(() => {
  vi.clearAllMocks();
  // In-org FKs resolve by default; org-validation tests override with null/false.
  customerFindFirst.mockResolvedValue({ id: 1 });
  estimateFindFirst.mockResolvedValue({ id: 1 });
  validateUserIds.mockResolvedValue(true);
});

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
  it("creates a visit without a estimateId", async () => {
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

  it("creates a job when estimateId is present", async () => {
    eventCreate.mockResolvedValue({ id: 1 });
    await createEvent("org1", {
      type: "job",
      title: "Install",
      estimateId: 42,
      date: new Date(),
      startTime: "08:00",
      endTime: "16:00",
    });
    expect(eventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ orgId: "org1", estimateId: 42 }),
      })
    );
  });

  it("connects assignees when assigneeIds is supplied", async () => {
    eventCreate.mockResolvedValue({ id: 1 });
    await createEvent("org1", {
      type: "visit",
      title: "Measure",
      date: new Date(),
      startTime: "10:00",
      endTime: "11:00",
      assigneeIds: ["u10", "u11"],
    });
    expect(eventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          assignees: { connect: [{ id: "u10" }, { id: "u11" }] },
        }),
      })
    );
  });

  it("rejects a job without a estimateId", async () => {
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

  it("rejects a customerId that isn't in the caller's org", async () => {
    customerFindFirst.mockResolvedValueOnce(null);
    await expect(
      createEvent("org1", {
        type: "visit",
        title: "Measure",
        customerId: 77,
        date: new Date(),
        startTime: "10:00",
        endTime: "11:00",
      })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(customerFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 77, orgId: "org1" } })
    );
    expect(eventCreate).not.toHaveBeenCalled();
  });

  it("rejects an estimateId that isn't in the caller's org", async () => {
    estimateFindFirst.mockResolvedValueOnce(null);
    await expect(
      createEvent("org1", {
        type: "job",
        title: "Install",
        estimateId: 42,
        date: new Date(),
        startTime: "08:00",
        endTime: "16:00",
      })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(estimateFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 42, orgId: "org1" } })
    );
    expect(eventCreate).not.toHaveBeenCalled();
  });

  it("does not look up FKs when none are supplied", async () => {
    eventCreate.mockResolvedValue({ id: 1 });
    await createEvent("org1", {
      type: "visit",
      title: "Measure",
      date: new Date(),
      startTime: "10:00",
      endTime: "11:00",
    });
    expect(customerFindFirst).not.toHaveBeenCalled();
    expect(estimateFindFirst).not.toHaveBeenCalled();
  });

  it("rejects an assignee that isn't in the caller's org, even called directly (bypassing the route)", async () => {
    validateUserIds.mockResolvedValueOnce(false);
    await expect(
      createEvent("org1", {
        type: "visit",
        title: "Measure",
        date: new Date(),
        startTime: "10:00",
        endTime: "11:00",
        assigneeIds: ["other-org-user"],
      })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(validateUserIds).toHaveBeenCalledWith("org1", ["other-org-user"]);
    expect(eventCreate).not.toHaveBeenCalled();
  });

  it("does not look up assignees when none are supplied", async () => {
    eventCreate.mockResolvedValue({ id: 1 });
    await createEvent("org1", {
      type: "visit",
      title: "Measure",
      date: new Date(),
      startTime: "10:00",
      endTime: "11:00",
    });
    expect(validateUserIds).not.toHaveBeenCalled();
  });
});

describe("updateEvent", () => {
  it("returns null when the event isn't found", async () => {
    eventFindFirst.mockResolvedValueOnce(null);
    expect(await updateEvent(99, "org1", { title: "x" })).toBeNull();
  });

  it("rejects when changing an existing job's estimateId to null", async () => {
    eventFindFirst.mockResolvedValueOnce({ type: "job", estimateId: 1 });
    await expect(
      updateEvent(1, "org1", { estimateId: null })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects when changing a visit's type to job without supplying a estimateId", async () => {
    eventFindFirst.mockResolvedValueOnce({ type: "visit", estimateId: null });
    await expect(
      updateEvent(1, "org1", { type: "job" })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("allows changing a job's estimateId to another estimate", async () => {
    eventFindFirst.mockResolvedValueOnce({ type: "job", estimateId: 1 });
    eventUpdate.mockResolvedValue({ id: 1 });
    await updateEvent(1, "org1", { estimateId: 2 });
    expect(eventUpdate).toHaveBeenCalled();
  });

  it("rejects changing customerId to one outside the org", async () => {
    eventFindFirst.mockResolvedValueOnce({ type: "visit", estimateId: null });
    customerFindFirst.mockResolvedValueOnce(null);
    await expect(
      updateEvent(1, "org1", { customerId: 77 })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(eventUpdate).not.toHaveBeenCalled();
  });

  it("rejects changing estimateId to one outside the org", async () => {
    eventFindFirst.mockResolvedValueOnce({ type: "job", estimateId: 1 });
    estimateFindFirst.mockResolvedValueOnce(null);
    await expect(
      updateEvent(1, "org1", { estimateId: 42 })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(eventUpdate).not.toHaveBeenCalled();
  });

  it("does not look up FKs that aren't being changed", async () => {
    eventFindFirst.mockResolvedValueOnce({ type: "visit", estimateId: null });
    eventUpdate.mockResolvedValue({ id: 1 });
    await updateEvent(1, "org1", { title: "Renamed" });
    expect(customerFindFirst).not.toHaveBeenCalled();
    expect(estimateFindFirst).not.toHaveBeenCalled();
  });

  it("uses set semantics when assigneeIds is supplied", async () => {
    eventFindFirst.mockResolvedValueOnce({ type: "visit", estimateId: null });
    eventUpdate.mockResolvedValue({ id: 1 });
    await updateEvent(1, "org1", { assigneeIds: ["u10"] });
    expect(eventUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: expect.objectContaining({
          assignees: { set: [{ id: "u10" }] },
        }),
      })
    );
  });

  it("rejects an assignee that isn't in the caller's org, even called directly (bypassing the route)", async () => {
    eventFindFirst.mockResolvedValueOnce({ type: "visit", estimateId: null });
    validateUserIds.mockResolvedValueOnce(false);
    await expect(
      updateEvent(1, "org1", { assigneeIds: ["other-org-user"] })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(validateUserIds).toHaveBeenCalledWith("org1", ["other-org-user"]);
    expect(eventUpdate).not.toHaveBeenCalled();
  });
});

describe("deleteEvent", () => {
  it("returns true when something was deleted", async () => {
    eventDeleteMany.mockResolvedValue({ count: 1 });
    expect(await deleteEvent(1, "org1")).toBe(true);
  });
});

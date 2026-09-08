import { beforeEach, describe, expect, it, vi } from "vitest";
import { ValidationError } from "@/lib/api/errors";

const eventFindMany = vi.fn();
const eventFindFirst = vi.fn();
const eventCreate = vi.fn();
const eventUpdate = vi.fn();
const eventDeleteMany = vi.fn();
const customerFindFirst = vi.fn();
const estimateFindFirst = vi.fn();

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

const { listEvents, createEvent, updateEvent, deleteEvent } = await import(
  "@/lib/repositories/eventRepo"
);

beforeEach(() => {
  vi.clearAllMocks();
  // In-org FKs resolve by default; org-validation tests override with null.
  customerFindFirst.mockResolvedValue({ id: 1 });
  estimateFindFirst.mockResolvedValue({ id: 1 });
});

/**
 * A stored row as `updateEvent`'s findFirst selects it — it reads the dates
 * and times too, so it can validate the merged (stored ∪ incoming) state.
 */
function storedEvent(over: Record<string, unknown> = {}) {
  return {
    type: "visit",
    estimateId: null,
    date: new Date("2026-07-09T00:00:00.000Z"),
    endDate: null,
    startTime: "09:00",
    endTime: "17:00",
    ...over,
  };
}

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

  it("rejects a same-day event that ends before it starts", async () => {
    await expect(
      createEvent("org1", {
        type: "visit",
        title: "Measure",
        date: new Date("2026-07-09T00:00:00.000Z"),
        startTime: "18:00",
        endTime: "17:00",
      })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(eventCreate).not.toHaveBeenCalled();
  });

  it("allows a multi-day event to wrap past midnight", async () => {
    eventCreate.mockResolvedValue({ id: 1 });
    await createEvent("org1", {
      type: "visit",
      title: "Overnight",
      date: new Date("2026-07-09T00:00:00.000Z"),
      endDate: new Date("2026-07-10T00:00:00.000Z"),
      startTime: "18:00",
      endTime: "06:00",
    });
    expect(eventCreate).toHaveBeenCalled();
  });
});

describe("updateEvent", () => {
  it("returns null when the event isn't found", async () => {
    eventFindFirst.mockResolvedValueOnce(null);
    expect(await updateEvent(99, "org1", { title: "x" })).toBeNull();
  });

  it("rejects when changing an existing job's estimateId to null", async () => {
    eventFindFirst.mockResolvedValueOnce(
      storedEvent({ type: "job", estimateId: 1 })
    );
    await expect(
      updateEvent(1, "org1", { estimateId: null })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects when changing a visit's type to job without supplying a estimateId", async () => {
    eventFindFirst.mockResolvedValueOnce(storedEvent());
    await expect(
      updateEvent(1, "org1", { type: "job" })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("allows changing a job's estimateId to another estimate", async () => {
    eventFindFirst.mockResolvedValueOnce(
      storedEvent({ type: "job", estimateId: 1 })
    );
    eventUpdate.mockResolvedValue({ id: 1 });
    await updateEvent(1, "org1", { estimateId: 2 });
    expect(eventUpdate).toHaveBeenCalled();
  });

  it("rejects changing customerId to one outside the org", async () => {
    eventFindFirst.mockResolvedValueOnce(storedEvent());
    customerFindFirst.mockResolvedValueOnce(null);
    await expect(
      updateEvent(1, "org1", { customerId: 77 })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(eventUpdate).not.toHaveBeenCalled();
  });

  it("rejects changing estimateId to one outside the org", async () => {
    eventFindFirst.mockResolvedValueOnce(
      storedEvent({ type: "job", estimateId: 1 })
    );
    estimateFindFirst.mockResolvedValueOnce(null);
    await expect(
      updateEvent(1, "org1", { estimateId: 42 })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(eventUpdate).not.toHaveBeenCalled();
  });

  // Prisma's UncheckedUpdateInput types every scalar as `T | { set: T }`, so
  // a caller building the update object "natively" (rather than passing a
  // raw zod-parsed number, as the only current route does) could legally
  // hand updateEvent a `{ set }`-wrapped FK. Regression test for #287: this
  // shape must still route through assertFksInOrg, not silently skip it.
  it("rejects a { set } - wrapped customerId outside the org", async () => {
    eventFindFirst.mockResolvedValueOnce(storedEvent());
    customerFindFirst.mockResolvedValueOnce(null);
    await expect(
      updateEvent(1, "org1", { customerId: { set: 77 } })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(customerFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 77, orgId: "org1" } })
    );
    expect(eventUpdate).not.toHaveBeenCalled();
  });

  it("rejects a { set } - wrapped estimateId outside the org", async () => {
    eventFindFirst.mockResolvedValueOnce(
      storedEvent({ type: "job", estimateId: 1 })
    );
    estimateFindFirst.mockResolvedValueOnce(null);
    await expect(
      updateEvent(1, "org1", { estimateId: { set: 42 } })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(estimateFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 42, orgId: "org1" } })
    );
    expect(eventUpdate).not.toHaveBeenCalled();
  });

  it("does not look up FKs that aren't being changed", async () => {
    eventFindFirst.mockResolvedValueOnce(storedEvent());
    eventUpdate.mockResolvedValue({ id: 1 });
    await updateEvent(1, "org1", { title: "Renamed" });
    expect(customerFindFirst).not.toHaveBeenCalled();
    expect(estimateFindFirst).not.toHaveBeenCalled();
  });

  // `eventUpdateSchema` can't refine a partial PATCH — it never sees the
  // stored endDate (or the time it isn't replacing) — so the merged check
  // lives here, on the row updateEvent already reads for the FK guards.
  describe("same-day time ordering", () => {
    it("rejects a startTime-only PATCH that inverts the stored times", async () => {
      eventFindFirst.mockResolvedValueOnce(
        storedEvent({ startTime: "09:00", endTime: "17:00" })
      );
      await expect(
        updateEvent(1, "org1", { startTime: "18:00" })
      ).rejects.toBeInstanceOf(ValidationError);
      expect(eventUpdate).not.toHaveBeenCalled();
    });

    it("rejects an endTime-only PATCH that inverts the stored times", async () => {
      eventFindFirst.mockResolvedValueOnce(
        storedEvent({ startTime: "09:00", endTime: "17:00" })
      );
      await expect(
        updateEvent(1, "org1", { endTime: "08:00" })
      ).rejects.toBeInstanceOf(ValidationError);
      expect(eventUpdate).not.toHaveBeenCalled();
    });

    it("allows a startTime-only PATCH that stays ordered", async () => {
      eventFindFirst.mockResolvedValueOnce(
        storedEvent({ startTime: "09:00", endTime: "17:00" })
      );
      eventUpdate.mockResolvedValue({ id: 1 });
      await updateEvent(1, "org1", { startTime: "10:00" });
      expect(eventUpdate).toHaveBeenCalled();
    });

    it("allows inverted times while the event stays multi-day", async () => {
      eventFindFirst.mockResolvedValueOnce(
        storedEvent({ endDate: new Date("2026-07-10T00:00:00.000Z") })
      );
      eventUpdate.mockResolvedValue({ id: 1 });
      await updateEvent(1, "org1", { startTime: "18:00", endTime: "06:00" });
      expect(eventUpdate).toHaveBeenCalled();
    });

    it("rejects inverted times when the PATCH clears endDate back to single-day", async () => {
      eventFindFirst.mockResolvedValueOnce(
        storedEvent({
          endDate: new Date("2026-07-10T00:00:00.000Z"),
          startTime: "18:00",
          endTime: "06:00",
        })
      );
      await expect(
        updateEvent(1, "org1", { endDate: null })
      ).rejects.toBeInstanceOf(ValidationError);
      expect(eventUpdate).not.toHaveBeenCalled();
    });

    it("allows an unrelated PATCH against a stored multi-day wrap", async () => {
      eventFindFirst.mockResolvedValueOnce(
        storedEvent({
          endDate: new Date("2026-07-10T00:00:00.000Z"),
          startTime: "18:00",
          endTime: "06:00",
        })
      );
      eventUpdate.mockResolvedValue({ id: 1 });
      await updateEvent(1, "org1", { title: "Renamed" });
      expect(eventUpdate).toHaveBeenCalled();
    });
  });

  it("uses set semantics when assigneeIds is supplied", async () => {
    eventFindFirst.mockResolvedValueOnce(storedEvent());
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
});

describe("deleteEvent", () => {
  it("returns true when something was deleted", async () => {
    eventDeleteMany.mockResolvedValue({ count: 1 });
    expect(await deleteEvent(1, "org1")).toBe(true);
  });
});

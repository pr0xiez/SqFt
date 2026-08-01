import { describe, expect, it } from "vitest";
import { eventCreateSchema, eventUpdateSchema } from "@/lib/events/schema";

const base = {
  type: "visit" as const,
  title: "Site visit",
  date: "2026-07-09",
  startTime: "09:00",
  endTime: "10:00",
};

describe("eventCreateSchema time ordering", () => {
  it("accepts a same-day event that ends after it starts", () => {
    expect(eventCreateSchema.safeParse(base).success).toBe(true);
  });

  it("rejects a same-day event ending at or before its start", () => {
    for (const endTime of ["09:00", "08:30"]) {
      const res = eventCreateSchema.safeParse({ ...base, endTime });
      expect(res.success).toBe(false);
    }
  });

  it("allows a multi-day event to wrap past midnight", () => {
    const res = eventCreateSchema.safeParse({
      ...base,
      endDate: "2026-07-10",
      startTime: "16:00",
      endTime: "07:00",
    });
    expect(res.success).toBe(true);
  });

  it("still rejects when endDate equals the start date", () => {
    const res = eventCreateSchema.safeParse({
      ...base,
      endDate: "2026-07-09",
      endTime: "08:00",
    });
    expect(res.success).toBe(false);
  });
});

describe("eventUpdateSchema time ordering (best-effort on partials)", () => {
  it("rejects when the payload clears endDate and times are inverted", () => {
    const res = eventUpdateSchema.safeParse({
      date: "2026-07-09",
      endDate: null,
      startTime: "10:00",
      endTime: "09:00",
    });
    expect(res.success).toBe(false);
  });

  it("rejects when both dates are present and equal with inverted times", () => {
    const res = eventUpdateSchema.safeParse({
      date: "2026-07-09",
      endDate: "2026-07-09",
      startTime: "10:00",
      endTime: "09:00",
    });
    expect(res.success).toBe(false);
  });

  // The schema can't see the stored endDate, so it defers rather than
  // rejecting a legitimate multi-day wrap; `eventRepo.updateEvent` re-checks
  // the merged state (see the updateEvent time-ordering tests).
  it("passes inverted times through when endDate is unknown (may be multi-day)", () => {
    const res = eventUpdateSchema.safeParse({
      startTime: "10:00",
      endTime: "09:00",
    });
    expect(res.success).toBe(true);
  });

  it("accepts a normal partial update", () => {
    expect(eventUpdateSchema.safeParse({ title: "New title" }).success).toBe(
      true
    );
  });
});

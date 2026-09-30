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

describe("eventCreateSchema field validation", () => {
  it("accepts every valid type enum value", () => {
    for (const type of ["job", "visit", "other"] as const) {
      expect(eventCreateSchema.safeParse({ ...base, type }).success).toBe(true);
    }
  });

  it("rejects an invalid type value", () => {
    expect(
      eventCreateSchema.safeParse({ ...base, type: "reminder" }).success
    ).toBe(false);
  });

  it("rejects an empty title", () => {
    expect(eventCreateSchema.safeParse({ ...base, title: "" }).success).toBe(
      false
    );
  });

  it("accepts a title at the 200-char maximum", () => {
    expect(
      eventCreateSchema.safeParse({ ...base, title: "t".repeat(200) }).success
    ).toBe(true);
  });

  it("rejects a title over the 200-char maximum", () => {
    expect(
      eventCreateSchema.safeParse({ ...base, title: "t".repeat(201) }).success
    ).toBe(false);
  });

  it("rejects a malformed date", () => {
    for (const date of ["2026-7-9", "07/09/2026", "2026-07-9", "not-a-date"]) {
      expect(eventCreateSchema.safeParse({ ...base, date }).success).toBe(
        false
      );
    }
  });

  it("rejects a structurally malformed startTime", () => {
    for (const startTime of ["9:00", "09:00:00", "0900", "9am"]) {
      expect(eventCreateSchema.safeParse({ ...base, startTime }).success).toBe(
        false
      );
    }
  });

  // The TIME_RE regex (`/^\d{2}:\d{2}$/`) only checks shape, not range — an
  // out-of-range hour/minute like "25:00" is not caught by the schema. This
  // documents the real (permissive) behavior rather than an assumed one.
  it("does not reject an out-of-range but shape-valid time", () => {
    expect(
      eventCreateSchema.safeParse({
        ...base,
        startTime: "23:00",
        endTime: "25:00",
      }).success
    ).toBe(true);
  });

  it("rejects a positive but non-integer customerId", () => {
    expect(
      eventCreateSchema.safeParse({ ...base, customerId: 1.5 }).success
    ).toBe(false);
  });

  it("rejects a non-positive estimateId", () => {
    expect(
      eventCreateSchema.safeParse({ ...base, estimateId: 0 }).success
    ).toBe(false);
  });

  it("accepts assigneeIds up to the 20-entry maximum", () => {
    const assigneeIds = Array.from({ length: 20 }, (_, i) => `user-${i}`);
    expect(eventCreateSchema.safeParse({ ...base, assigneeIds }).success).toBe(
      true
    );
  });

  it("rejects assigneeIds over the 20-entry maximum", () => {
    const assigneeIds = Array.from({ length: 21 }, (_, i) => `user-${i}`);
    expect(eventCreateSchema.safeParse({ ...base, assigneeIds }).success).toBe(
      false
    );
  });

  it("rejects an empty-string assignee id", () => {
    expect(
      eventCreateSchema.safeParse({ ...base, assigneeIds: [""] }).success
    ).toBe(false);
  });

  it("allows omitting assigneeIds entirely", () => {
    expect(eventCreateSchema.safeParse(base).success).toBe(true);
  });

  it("accepts notes at the 2000-char maximum", () => {
    expect(
      eventCreateSchema.safeParse({ ...base, notes: "n".repeat(2000) }).success
    ).toBe(true);
  });

  it("rejects notes over the 2000-char maximum", () => {
    expect(
      eventCreateSchema.safeParse({ ...base, notes: "n".repeat(2001) }).success
    ).toBe(false);
  });

  it("rejects when a required field is missing", () => {
    expect(
      eventCreateSchema.safeParse({
        type: "visit",
        title: "Site visit",
        date: "2026-07-09",
        startTime: "09:00",
        // endTime omitted
      }).success
    ).toBe(false);
  });
});

describe("eventUpdateSchema field validation", () => {
  it("rejects an invalid type value", () => {
    expect(eventUpdateSchema.safeParse({ type: "reminder" }).success).toBe(
      false
    );
  });

  it("allows customerId/estimateId to be explicitly nulled", () => {
    expect(
      eventUpdateSchema.safeParse({ customerId: null, estimateId: null })
        .success
    ).toBe(true);
  });

  it("rejects a non-positive customerId", () => {
    expect(eventUpdateSchema.safeParse({ customerId: -1 }).success).toBe(false);
  });

  it("rejects assigneeIds over the 20-entry maximum", () => {
    const assigneeIds = Array.from({ length: 21 }, (_, i) => `user-${i}`);
    expect(eventUpdateSchema.safeParse({ assigneeIds }).success).toBe(false);
  });

  it("rejects a malformed date if provided", () => {
    expect(eventUpdateSchema.safeParse({ date: "2026/07/09" }).success).toBe(
      false
    );
  });

  it("allows endDate to be explicitly nulled", () => {
    expect(eventUpdateSchema.safeParse({ endDate: null }).success).toBe(true);
  });
});

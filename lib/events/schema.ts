import { z } from "zod";
import { timeToMinutes } from "@/lib/utils";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

function endTimeAfterStart() {
  return {
    code: "custom" as const,
    path: ["endTime"],
    message: "End time must be after start time",
  };
}

export const eventCreateSchema = z
  .object({
    type: z.enum(["job", "visit", "other"]),
    title: z.string().min(1).max(200),
    customerId: z.number().int().positive().optional(),
    estimateId: z.number().int().positive().optional(),
    date: z.string().regex(DATE_RE),
    endDate: z.string().regex(DATE_RE).optional(),
    startTime: z.string().regex(TIME_RE),
    endTime: z.string().regex(TIME_RE),
    assigneeIds: z.array(z.string().min(1)).max(20).optional(),
    notes: z.string().max(2000).optional(),
  })
  .superRefine((d, ctx) => {
    // A multi-day event may legitimately wrap past midnight; only same-day
    // events must end after they start.
    const sameDay = !d.endDate || d.endDate <= d.date;
    if (sameDay && timeToMinutes(d.endTime) <= timeToMinutes(d.startTime)) {
      ctx.addIssue(endTimeAfterStart());
    }
  });

export const eventUpdateSchema = z
  .object({
    type: z.enum(["job", "visit", "other"]).optional(),
    title: z.string().min(1).max(200).optional(),
    customerId: z.number().int().positive().nullable().optional(),
    estimateId: z.number().int().positive().nullable().optional(),
    date: z.string().regex(DATE_RE).optional(),
    endDate: z.string().regex(DATE_RE).nullable().optional(),
    startTime: z.string().regex(TIME_RE).optional(),
    endTime: z.string().regex(TIME_RE).optional(),
    assigneeIds: z.array(z.string().min(1)).max(20).optional(),
    notes: z.string().max(2000).optional(),
  })
  .superRefine((d, ctx) => {
    // Best-effort: a partial PATCH is only checkable here when the payload
    // itself proves the event is single-day (endDate cleared, or both dates
    // present and equal). Payloads that leave endDate — or either time —
    // unknown pass through to `eventRepo.updateEvent`, which re-checks the
    // merged stored ∪ incoming state against the row it already reads.
    if (!d.startTime || !d.endTime) return;
    const singleDay =
      d.endDate === null ||
      (d.endDate != null && d.date != null && d.endDate <= d.date);
    if (singleDay && timeToMinutes(d.endTime) <= timeToMinutes(d.startTime)) {
      ctx.addIssue(endTimeAfterStart());
    }
  });

export const eventIdParams = z.object({
  id: z.coerce.number().int().positive(),
});

export type EventCreateInput = z.infer<typeof eventCreateSchema>;
export type EventUpdateInput = z.infer<typeof eventUpdateSchema>;

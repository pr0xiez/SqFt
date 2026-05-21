import { z } from "zod";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export const eventCreateSchema = z.object({
  type: z.enum(["job", "visit", "other"]),
  title: z.string().min(1).max(200),
  customerId: z.number().int().positive().optional(),
  quoteId: z.number().int().positive().optional(),
  date: z.string().regex(DATE_RE),
  endDate: z.string().regex(DATE_RE).optional(),
  startTime: z.string().regex(TIME_RE),
  endTime: z.string().regex(TIME_RE),
  crewMemberIds: z.array(z.number().int().positive()).max(20).optional(),
  notes: z.string().max(2000).optional(),
});

export const eventUpdateSchema = z.object({
  type: z.enum(["job", "visit", "other"]).optional(),
  title: z.string().min(1).max(200).optional(),
  customerId: z.number().int().positive().nullable().optional(),
  quoteId: z.number().int().positive().nullable().optional(),
  date: z.string().regex(DATE_RE).optional(),
  endDate: z.string().regex(DATE_RE).nullable().optional(),
  startTime: z.string().regex(TIME_RE).optional(),
  endTime: z.string().regex(TIME_RE).optional(),
  crewMemberIds: z.array(z.number().int().positive()).max(20).optional(),
  notes: z.string().max(2000).optional(),
});

export const eventIdParams = z.object({
  id: z.coerce.number().int().positive(),
});

export type EventCreateInput = z.infer<typeof eventCreateSchema>;
export type EventUpdateInput = z.infer<typeof eventUpdateSchema>;

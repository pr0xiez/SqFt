import { z } from "zod";
import { QTY_MODE_VALUES, QtyMode } from "@/lib/utils";

const lineItemSchema = z.object({
  id: z.number().int().optional(),
  name: z.string(),
  description: z.string().nullish(),
  rate: z.number(),
  qtyMode: z.enum(QTY_MODE_VALUES).default(QtyMode.Manual),
  qty: z.number().nullish(),
  wastePct: z.number().default(0),
  unitLabel: z.string().default("ft²"),
  linkedRoomIds: z.array(z.number().int()).default([]),
  sortOrder: z.number().int().default(0),
});

export const estimateCreateSchema = z.object({
  siteMeasureId: z.number().int().positive(),
});

export const estimateUpdateSchema = z.object({
  status: z.enum(["draft", "sent", "approved", "declined"]).optional(),
  markupPct: z.number().min(0).optional(),
  depositPct: z.number().min(0).max(1).optional(),
  lineItems: z.array(lineItemSchema).optional(),
});

export const estimateIdParams = z.object({
  id: z.coerce.number().int().positive(),
});

export const estimateSendSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1).max(200),
  message: z.string().max(2000).optional(),
  regenerateLink: z.boolean().optional(),
});

export const estimateDeclineSchema = z.object({
  reason: z.string().max(1000).optional(),
});

export const estimateTokenParams = z.object({
  token: z.string().min(16).max(128),
});

export type EstimateCreateInput = z.infer<typeof estimateCreateSchema>;
export type EstimateUpdateInput = z.infer<typeof estimateUpdateSchema>;
export type EstimateSendInput = z.infer<typeof estimateSendSchema>;
export type EstimateDeclineInput = z.infer<typeof estimateDeclineSchema>;

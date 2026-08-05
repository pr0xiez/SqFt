import { z } from "zod";
import { QTY_MODE_VALUES, QtyMode } from "@/lib/utils";

export const lineItemSchema = z.object({
  id: z.number().int().optional(),
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2000).nullish(),
  rate: z.number().finite().min(0),
  qtyMode: z.enum(QTY_MODE_VALUES).default(QtyMode.Manual),
  qty: z.number().finite().min(0).nullish(),
  wastePct: z.number().finite().min(0).max(100).default(0),
  unitLabel: z.string().trim().min(1).max(20).default("ft²"),
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

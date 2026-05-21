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

export const quoteCreateSchema = z.object({
  estimateId: z.number().int().positive(),
});

export const quoteUpdateSchema = z.object({
  status: z.enum(["draft", "sent", "accepted", "declined"]).optional(),
  convenienceFeeRate: z.number().min(0).max(1).optional(),
  markupPct: z.number().min(0).optional(),
  depositPct: z.number().min(0).max(1).optional(),
  lineItems: z.array(lineItemSchema).optional(),
});

export const quoteIdParams = z.object({
  id: z.coerce.number().int().positive(),
});

export const quoteSendSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1).max(200),
  message: z.string().max(2000).optional(),
  regenerateLink: z.boolean().optional(),
});

export const quoteAcceptSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  signatureDataUrl: z
    .string()
    .startsWith("data:image/png;base64,", "Signature must be a base64 PNG"),
  consentText: z.string().min(1).max(2000),
});

export const quoteDeclineSchema = z.object({
  reason: z.string().max(1000).optional(),
});

export const quoteTokenParams = z.object({
  token: z.string().min(16).max(128),
});

export type QuoteCreateInput = z.infer<typeof quoteCreateSchema>;
export type QuoteUpdateInput = z.infer<typeof quoteUpdateSchema>;
export type QuoteSendInput = z.infer<typeof quoteSendSchema>;
export type QuoteAcceptInput = z.infer<typeof quoteAcceptSchema>;
export type QuoteDeclineInput = z.infer<typeof quoteDeclineSchema>;

import { z } from "zod";

export const PAYMENT_METHODS = [
  "check",
  "cash",
  "card",
  "ach",
  "stripe",
  "other",
] as const;

/** Create: bill EITHER a flat dollar `amount` OR a `pct` (0–1), never both/neither. */
export const invoiceCreateSchema = z
  .object({
    amount: z.number().positive().optional(),
    pct: z.number().gt(0).max(1).optional(),
    memo: z.string().max(120).optional(),
    terms: z.string().max(2000).optional(),
    coverNote: z.string().max(2000).optional(),
    dueDate: z.string().datetime().optional(),
  })
  .refine((v) => (v.amount === undefined) !== (v.pct === undefined), {
    message: "Provide exactly one of amount or pct",
    path: ["amount"],
  });

export const invoiceSendSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1).max(200),
  regenerateLink: z.boolean().optional(),
});

export const invoicePaymentSchema = z.object({
  amount: z.number().positive(),
  method: z.enum(PAYMENT_METHODS),
  paidAt: z.string().datetime().optional(),
  reference: z.string().max(120).optional(),
  note: z.string().max(2000).optional(),
});

export const invoiceIdParams = z.object({
  id: z.coerce.number().int().positive(),
});

export const invoiceTokenParams = z.object({
  token: z.string().min(16).max(128),
});

export type InvoiceCreateInput = z.infer<typeof invoiceCreateSchema>;
export type InvoiceSendInput = z.infer<typeof invoiceSendSchema>;
export type InvoicePaymentInput = z.infer<typeof invoicePaymentSchema>;

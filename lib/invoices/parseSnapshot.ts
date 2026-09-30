import { z } from "zod";
import type { InvoiceSnapshot } from "@/lib/invoices/types";
import { logError } from "@/lib/logger";

/** Mirrors `ProratedLine` in `lib/invoices/types.ts`. */
const proratedLineSchema = z.object({
  name: z.string(),
  description: z.string().nullable(),
  amount: z.number(),
});

const customerSchema = z
  .object({
    name: z.string().nullable(),
    address: z.string().nullable(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
  })
  .nullable();

const orgSchema = z.object({
  name: z.string(),
  address: z.string().nullable(),
  phone: z.string().nullable(),
  licenseNumber: z.string().nullable(),
  logoUrl: z.string().nullable(),
});

const totalsSchema = z.object({
  subtotal: z.number(),
  markup: z.number(),
  balanceDue: z.number(),
});

/** Mirrors `InvoiceSnapshot` in `lib/invoices/types.ts` — the frozen,
 *  customer-facing invoice document. Snapshots are written once and never
 *  migrated, so a snapshot written before a later schema change can be
 *  missing fields; validate before reading rather than trusting a cast. */
const invoiceSnapshotSchema = z.object({
  invoiceNumber: z.number(),
  date: z.string(),
  dueDate: z.string().nullable(),
  memo: z.string().nullable(),
  terms: z.string(),
  paymentInstructions: z.string(),
  pct: z.number().nullable(),
  amount: z.number(),
  customer: customerSchema,
  org: orgSchema,
  stripePaymentLinkUrl: z.string().nullable(),
  lines: z.array(proratedLineSchema),
  totals: totalsSchema,
}) satisfies z.ZodType<InvoiceSnapshot>;

/**
 * Validate an invoice's frozen `snapshot` JSON blob at the DB→render trust
 * boundary. Returns `null` (logging via `logError`) instead of throwing when
 * the blob doesn't match the canonical `InvoiceSnapshot` shape — e.g. an
 * older invoice snapshotted before a field existed. Callers (notably the
 * public `invoice-review` page) must treat `null` as "not found", not a 500.
 */
export function parseInvoiceSnapshot(raw: unknown): InvoiceSnapshot | null {
  const result = invoiceSnapshotSchema.safeParse(raw);
  if (!result.success) {
    logError({
      errorMessage: "Invalid invoice snapshot shape",
      err: result.error,
    });
    return null;
  }
  return result.data;
}

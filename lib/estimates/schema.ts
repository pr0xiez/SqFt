import { z } from "zod";
import { OPERATOR_SETTABLE_ESTIMATE_STATUSES } from "@/lib/estimateStatus";
import { QTY_MODE_VALUES, QtyMode } from "@/lib/utils";

export const lineItemSchema = z.object({
  id: z.number().int().optional(),
  // Draft saves send every row. Preserve legacy text and mid-edit blank names
  // rather than rejecting the entire estimate or silently truncating data.
  name: z.string(),
  description: z.string().nullish(),
  rate: z.number().finite().min(0),
  qtyMode: z.enum(QTY_MODE_VALUES).default(QtyMode.Manual),
  qty: z.number().finite().min(0).nullish(),
  wastePct: z.number().finite().min(0).max(100).default(0),
  unitLabel: z.string().default("ft²"),
  linkedRoomIds: z.array(z.number().int()).default([]),
  sortOrder: z.number().int().default(0),
});

export const estimateCreateSchema = z.object({
  siteMeasureId: z.number().int().positive(),
});

// "approved"/"declined" are deliberately excluded: those transitions carry
// customer-consent invariants (an EstimateApproval row with ip/userAgent/
// snapshot, supersede-siblings) that only exist in
// approveEstimateByToken / declineEstimateByToken (see CONTEXT.md "Estimate
// Approval"). This schema gates the builder-facing PATCH, so terminal
// statuses can't be forged through it — see saveEstimate for the matching
// repo-layer guard.
export const estimateUpdateSchema = z.object({
  status: z.enum(OPERATOR_SETTABLE_ESTIMATE_STATUSES).optional(),
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

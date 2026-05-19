import { z } from "zod";

export const lineItemTemplateCreateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullish(),
  rate: z.number().min(0).optional(),
  unitLabel: z.string().max(40).optional(),
});

export const lineItemTemplateUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullish(),
  rate: z.number().min(0).optional(),
  unitLabel: z.string().max(40).optional(),
  archived: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const lineItemTemplateIdParams = z.object({
  id: z.coerce.number().int().positive(),
});

export type LineItemTemplateCreateInput = z.infer<
  typeof lineItemTemplateCreateSchema
>;
export type LineItemTemplateUpdateInput = z.infer<
  typeof lineItemTemplateUpdateSchema
>;

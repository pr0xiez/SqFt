import { z } from "zod";

const itemSchema = z.object({
  id: z.number().int(),
  type: z.enum(["room", "note"]),
  sortOrder: z.number().int().default(0),
  name: z.string().nullish(),
  shape: z.enum(["rect", "tri"]).nullish(),
  w: z.number().nullish(),
  l: z.number().nullish(),
  note: z.string().nullish(),
  text: z.string().nullish(),
});

export const estimateCreateSchema = z.object({
  customerId: z.number().int().positive(),
  title: z.string().max(200).default(""),
});

export const estimateUpdateSchema = z.object({
  title: z.string().max(200).optional(),
  customerId: z.number().int().positive().optional(),
  items: z.array(itemSchema).optional(),
});

export const estimateIdParams = z.object({
  id: z.coerce.number().int().positive(),
});

export type EstimateCreateInput = z.infer<typeof estimateCreateSchema>;
export type EstimateUpdateInput = z.infer<typeof estimateUpdateSchema>;

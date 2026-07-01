import { z } from "zod";

const itemSchema = z.object({
  id: z.number().int(),
  type: z.enum(["room", "note"]),
  sortOrder: z.number().int().default(0),
  name: z.string().nullish(),
  shape: z.enum(["rect", "tri"]).nullish(),
  w: z.number().nullish(),
  l: z.number().nullish(),
  segments: z
    .array(z.object({ w: z.number().nullish(), l: z.number().nullish() }))
    .nullish(),
  note: z.string().nullish(),
  text: z.string().nullish(),
});

export const estimateCreateSchema = z.object({
  locationId: z.number().int().positive(),
});

export const estimateUpdateSchema = z.object({
  locationId: z.number().int().positive().optional(),
  items: z.array(itemSchema).optional(),
});

export const estimateIdParams = z.object({
  id: z.coerce.number().int().positive(),
});

export type SiteMeasureCreateInput = z.infer<typeof estimateCreateSchema>;
export type SiteMeasureUpdateInput = z.infer<typeof estimateUpdateSchema>;

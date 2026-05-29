import { z } from "zod";

export const locationCreateSchema = z.object({
  customerId: z.number().int().positive(),
  address: z.string().min(1).max(400),
  label: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
});

export const locationListQuery = z.object({
  customerId: z.coerce.number().int().positive(),
});

export type LocationCreateInput = z.infer<typeof locationCreateSchema>;

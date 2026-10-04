import { z } from "zod";

export const locationCreateSchema = z.object({
  customerId: z.number().int().positive(),
  street: z.string().min(1).max(200),
  unit: z.string().max(100).optional(),
  city: z.string().min(1).max(120),
  state: z.string().min(1).max(60),
  postalCode: z.string().min(1).max(20),
  lat: z.number().optional(),
  lon: z.number().optional(),
  label: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
});

export const locationListQuery = z.object({
  customerId: z.coerce.number().int().positive(),
});

export type LocationCreateInput = z.infer<typeof locationCreateSchema>;

export const locationSearchQuery = z.object({
  q: z.string().max(200).default(""),
});

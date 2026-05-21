import { z } from "zod";

const SOURCE_VALUES = [
  "phone",
  "online",
  "referral",
  "walkin",
  "website",
] as const;

export const customerCreateSchema = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().max(30).optional(),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().max(400).optional(),
  source: z.enum(SOURCE_VALUES).default("phone"),
  notes: z.string().max(2000).optional(),
});

export const customerUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  phone: z.string().max(30).optional(),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().max(400).optional(),
  source: z.enum(SOURCE_VALUES).optional(),
  notes: z.string().max(2000).optional(),
});

export const customerIdParams = z.object({
  id: z.coerce.number().int().positive(),
});

export type CustomerCreateInput = z.infer<typeof customerCreateSchema>;
export type CustomerUpdateInput = z.infer<typeof customerUpdateSchema>;

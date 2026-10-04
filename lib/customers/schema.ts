import { z } from "zod";
import { locationCreateSchema } from "@/lib/locations/schema";

const SOURCE_VALUES = [
  "phone",
  "online",
  "referral",
  "walkin",
  "website",
] as const;

/** The customer's first address, captured by the New Customer panel and
 *  created as their first Location in the same transaction as the customer. */
export const customerLocationSchema = locationCreateSchema.omit({
  customerId: true,
});

export const customerCreateSchema = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().max(30).optional(),
  email: z.string().email().optional().or(z.literal("")),
  source: z.enum(SOURCE_VALUES).default("phone"),
  notes: z.string().max(2000).optional(),
  location: customerLocationSchema.optional(),
});

export const customerUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  phone: z.string().max(30).optional(),
  email: z.string().email().optional().or(z.literal("")),
  source: z.enum(SOURCE_VALUES).optional(),
  notes: z.string().max(2000).optional(),
});

export const customerIdParams = z.object({
  id: z.coerce.number().int().positive(),
});

export type CustomerCreateInput = z.infer<typeof customerCreateSchema>;
export type CustomerLocationInput = z.infer<typeof customerLocationSchema>;
export type CustomerUpdateInput = z.infer<typeof customerUpdateSchema>;

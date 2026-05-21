import { z } from "zod";

export const crewMemberCreateSchema = z.object({
  name: z.string().min(1).max(100),
  role: z.string().max(100).optional(),
});

export const crewMemberUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  role: z.string().max(100).optional(),
  archived: z.boolean().optional(),
});

export const crewMemberIdParams = z.object({
  id: z.coerce.number().int().positive(),
});

export type CrewMemberCreateInput = z.infer<typeof crewMemberCreateSchema>;
export type CrewMemberUpdateInput = z.infer<typeof crewMemberUpdateSchema>;

/**
 * Shared Zod schemas for user create/patch bodies.
 *
 * Used by both the self-org routes (`app/api/users/`) and the super-admin
 * routes (`app/api/admin/orgs/[orgId]/users/`) — the request shapes are
 * identical between the two; only the target org and the self-guard checks
 * differ (self-org reads `orgId` from the session, super-admin reads it from
 * the URL param — see AGENTS.md).
 */
import { z } from "zod";

export const userCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    email: z.string().email().toLowerCase().max(254),
    role: z.enum(["admin", "lead", "crew"]),
    password: z.string().min(8).max(200),
  })
  .strict();

export type UserCreateInput = z.infer<typeof userCreateSchema>;

export const userPatchSchema = z
  .object({
    role: z.enum(["admin", "lead", "crew"]).optional(),
    name: z.string().trim().min(1).max(100).optional(),
    title: z.string().trim().max(100).nullable().optional(),
    archived: z.boolean().optional(),
  })
  .strict();

export type UserPatchInput = z.infer<typeof userPatchSchema>;

import { z } from "zod";
import { CannotDemoteSelfError, NotFoundError } from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/route";
import {
  findUserRow,
  setArchived,
  updateProfile,
  updateRole,
} from "@/lib/repositories";
import { requireSession } from "@/lib/tenant";

const PatchBody = z
  .object({
    role: z.enum(["admin", "lead", "crew"]).optional(),
    name: z.string().trim().min(1).max(100).optional(),
    title: z.string().trim().max(100).nullable().optional(),
    archived: z.boolean().optional(),
  })
  .strict();

export const PATCH = apiRoute(
  { minRole: "admin", input: PatchBody },
  async ({ orgId, input, params }) => {
    const session = await requireSession();
    const targetId = (params as { id: string }).id;

    if (input.role !== undefined) {
      if (targetId === session.user.id && input.role !== "admin") {
        throw new CannotDemoteSelfError();
      }
      // updateRole throws LastAdminError if this would demote the last admin.
      if (!(await updateRole(targetId, orgId, input.role))) {
        throw new NotFoundError();
      }
    }

    if (input.name !== undefined || input.title !== undefined) {
      const ok = await updateProfile(targetId, orgId, {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.title !== undefined ? { title: input.title } : {}),
      });
      if (!ok) throw new NotFoundError();
    }

    if (input.archived !== undefined) {
      if (targetId === session.user.id && input.archived) {
        throw new CannotDemoteSelfError("You can't archive yourself.");
      }
      // setArchived throws LastAdminError if this would archive the last admin.
      if (!(await setArchived(targetId, orgId, input.archived))) {
        throw new NotFoundError();
      }
    }

    const row = await findUserRow(targetId, orgId);
    if (!row) throw new NotFoundError();
    return row;
  }
);

/**
 * Super-admin org member management (single user).
 *
 * PATCH — change role / name / title / archived for a user in the target org.
 * Gated by `apiRoute({ superAdmin: true })`. Scope is `params.orgId` (URL), so a
 * userId not in that org returns 404. `updateRole` / `setArchived` throw
 * LastAdminError (400 LAST_ADMIN) if the change would strip the org's last admin.
 * No "can't change yourself" guard: the operator acts on another org's users.
 */
import { z } from "zod";
import { NotFoundError } from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/route";
import {
  findUserRow,
  setArchived,
  updateProfile,
  updateRole,
} from "@/lib/repositories";

const PatchBody = z
  .object({
    role: z.enum(["admin", "lead", "crew"]).optional(),
    name: z.string().trim().min(1).max(100).optional(),
    title: z.string().trim().max(100).nullable().optional(),
    archived: z.boolean().optional(),
  })
  .strict();

export const PATCH = apiRoute(
  { superAdmin: true, input: PatchBody },
  async ({ input, params }) => {
    const { orgId, userId } = params as { orgId: string; userId: string };

    if (input.role !== undefined) {
      if (!(await updateRole(userId, orgId, input.role))) {
        throw new NotFoundError();
      }
    }

    if (input.name !== undefined || input.title !== undefined) {
      const ok = await updateProfile(userId, orgId, {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.title !== undefined ? { title: input.title } : {}),
      });
      if (!ok) throw new NotFoundError();
    }

    if (input.archived !== undefined) {
      if (!(await setArchived(userId, orgId, input.archived))) {
        throw new NotFoundError();
      }
    }

    const row = await findUserRow(userId, orgId);
    if (!row) throw new NotFoundError();
    return row;
  }
);

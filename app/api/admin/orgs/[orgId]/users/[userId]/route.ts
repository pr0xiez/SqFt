/**
 * Super-admin org member management (single user).
 *
 * PATCH — change role / name / title / archived for a user in the target org.
 * Gated by `apiRoute({ superAdmin: true })`. Scope is `params.orgId` (URL), so a
 * userId not in that org returns 404. `updateRole` / `setArchived` throw
 * LastAdminError (400 LAST_ADMIN) if the change would strip the org's last admin.
 * No "can't change yourself" guard: the operator acts on another org's users.
 */
import { apiRoute } from "@/lib/api/route";
import { applyUserPatch } from "@/lib/repositories";
import { userPatchSchema } from "@/lib/users/schema";

export const PATCH = apiRoute(
  { superAdmin: true, input: userPatchSchema },
  async ({ input, params }) => {
    const { orgId, userId } = params as { orgId: string; userId: string };
    return applyUserPatch(userId, orgId, input);
  }
);

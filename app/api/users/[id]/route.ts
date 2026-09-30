import { CannotDemoteSelfError } from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/route";
import { applyUserPatch } from "@/lib/repositories";
import { requireSession } from "@/lib/tenant";
import { userPatchSchema } from "@/lib/users/schema";

export const PATCH = apiRoute(
  { minRole: "admin", input: userPatchSchema },
  async ({ orgId, input, params }) => {
    const session = await requireSession();
    const targetId = (params as { id: string }).id;

    return applyUserPatch(targetId, orgId, input, {
      beforeRoleChange: (role) => {
        if (targetId === session.user.id && role !== "admin") {
          throw new CannotDemoteSelfError();
        }
      },
      beforeArchive: (archived) => {
        if (targetId === session.user.id && archived) {
          throw new CannotDemoteSelfError("You can't archive yourself.");
        }
      },
    });
  }
);

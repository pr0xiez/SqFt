import { apiRoute } from "@/lib/api/route";
import { listAssignableUsers } from "@/lib/repositories";

export const GET = apiRoute({ minRole: "lead" }, async ({ orgId }) =>
  listAssignableUsers(orgId)
);

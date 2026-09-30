import { apiRoute } from "@/lib/api/route";
import { listSchedulableEstimates } from "@/lib/repositories";

/**
 * Unscheduled-jobs backlog for the Schedule Manager: approved estimates with
 * no `job` event scheduled yet, oldest approval first.
 */
export const GET = apiRoute({ minRole: "lead" }, async ({ orgId }) =>
  listSchedulableEstimates(orgId)
);

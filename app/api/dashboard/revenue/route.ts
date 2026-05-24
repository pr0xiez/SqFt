import { apiRoute } from "@/lib/api/route";
import { getDashboardRevenue } from "@/lib/dashboard/revenue";

export const GET = apiRoute({ minRole: "lead" }, async ({ orgId }) =>
  getDashboardRevenue(orgId)
);

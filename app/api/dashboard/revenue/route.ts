import { apiRoute } from "@/lib/api/route";
import { getDashboardRevenue } from "@/lib/dashboard/revenue";

export const GET = apiRoute(async ({ orgId }) => getDashboardRevenue(orgId));

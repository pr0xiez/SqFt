import { apiRoute } from "@/lib/api/route";
import { getDashboardKpis } from "@/lib/dashboard/kpis";

export const GET = apiRoute(async ({ orgId }) => getDashboardKpis(orgId));

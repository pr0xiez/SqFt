import { apiRoute } from "@/lib/api/route";
import { getConnectStatus } from "@/lib/stripe/onboarding";

export const GET = apiRoute({ minRole: "admin" }, async ({ orgId }) => {
  return getConnectStatus(orgId);
});

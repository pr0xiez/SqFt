import { apiRoute } from "@/lib/api/route";
import { locationSearchQuery } from "@/lib/locations/schema";
import { searchLocations } from "@/lib/repositories";

export const GET = apiRoute({ minRole: "lead" }, async ({ req, orgId }) => {
  const { q } = locationSearchQuery.parse({
    q: req.nextUrl.searchParams.get("q") ?? undefined,
  });
  return searchLocations(orgId, q);
});

import { ValidationError } from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/route";
import {
  locationCreateSchema,
  locationListQuery,
} from "@/lib/locations/schema";
import { createLocation, listLocationsForCustomer } from "@/lib/repositories";

export const GET = apiRoute({ minRole: "lead" }, async ({ req, orgId }) => {
  const parsed = locationListQuery.safeParse({
    customerId: req.nextUrl.searchParams.get("customerId") ?? undefined,
  });
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "customerId is required",
      parsed.error.issues
    );
  }
  return listLocationsForCustomer(orgId, parsed.data.customerId);
});

export const POST = apiRoute(
  { minRole: "lead", input: locationCreateSchema, status: 201 },
  async ({ orgId, input }) => createLocation({ orgId, ...input })
);

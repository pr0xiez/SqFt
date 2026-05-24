import { apiRoute } from "@/lib/api/route";
import { crewMemberCreateSchema } from "@/lib/crewMembers/schema";
import { createCrewMember, listCrewMembers } from "@/lib/repositories";

export const GET = apiRoute(async ({ orgId, req }) => {
  const includeArchived =
    req.nextUrl.searchParams.get("includeArchived") === "1";
  return listCrewMembers(orgId, { includeArchived });
});

export const POST = apiRoute(
  { minRole: "lead", input: crewMemberCreateSchema, status: 201 },
  async ({ orgId, input }) => createCrewMember(orgId, input)
);

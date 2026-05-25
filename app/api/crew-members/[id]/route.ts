import { NotFoundError } from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/route";
import {
  crewMemberIdParams,
  crewMemberUpdateSchema,
} from "@/lib/crewMembers/schema";
import { deleteCrewMember, updateCrewMember } from "@/lib/repositories";

export const PATCH = apiRoute(
  { minRole: "lead", input: crewMemberUpdateSchema },
  async ({ orgId, input, params }) => {
    const { id } = crewMemberIdParams.parse(params);
    const member = await updateCrewMember(id, orgId, input);
    if (!member) throw new NotFoundError();
    return member;
  }
);

export const DELETE = apiRoute(
  { minRole: "lead" },
  async ({ orgId, params }) => {
    const { id } = crewMemberIdParams.parse(params);
    const result = await deleteCrewMember(id, orgId);
    if (!result.ok) throw new NotFoundError();
    return null;
  }
);

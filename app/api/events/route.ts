import { EventValidationError } from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/route";
import { eventCreateSchema } from "@/lib/events/schema";
import {
  createEvent,
  listEvents,
  validateCrewMemberIds,
} from "@/lib/repositories";

export const GET = apiRoute(async ({ orgId }) => listEvents(orgId));

export const POST = apiRoute(
  { input: eventCreateSchema, status: 201 },
  async ({ orgId, input }) => {
    const { endDate, crewMemberIds, ...rest } = input;

    if (crewMemberIds && crewMemberIds.length > 0) {
      const ok = await validateCrewMemberIds(orgId, crewMemberIds);
      if (!ok) throw new EventValidationError("Invalid crew member");
    }

    return createEvent(orgId, {
      ...rest,
      date: new Date(rest.date),
      ...(endDate ? { endDate: new Date(endDate) } : {}),
      ...(crewMemberIds ? { crewMemberIds } : {}),
    });
  }
);

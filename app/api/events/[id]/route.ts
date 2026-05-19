import { EventValidationError, NotFoundError } from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/route";
import { eventIdParams, eventUpdateSchema } from "@/lib/events/schema";
import {
  deleteEvent,
  updateEvent,
  validateCrewMemberIds,
} from "@/lib/repositories";

export const PATCH = apiRoute(
  { input: eventUpdateSchema },
  async ({ orgId, input, params }) => {
    const { id } = eventIdParams.parse(params);
    const { date, endDate, crewMemberIds, ...rest } = input;

    if (crewMemberIds && crewMemberIds.length > 0) {
      const ok = await validateCrewMemberIds(orgId, crewMemberIds);
      if (!ok) throw new EventValidationError("Invalid crew member");
    }

    const data = {
      ...rest,
      ...(date ? { date: new Date(date) } : {}),
      ...(endDate !== undefined
        ? { endDate: endDate ? new Date(endDate) : null }
        : {}),
      ...(crewMemberIds !== undefined ? { crewMemberIds } : {}),
    };

    const event = await updateEvent(id, orgId, data);
    if (!event) throw new NotFoundError();
    return event;
  }
);

export const DELETE = apiRoute(async ({ orgId, params }) => {
  const { id } = eventIdParams.parse(params);
  await deleteEvent(id, orgId);
  return null;
});

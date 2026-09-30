import { NotFoundError } from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/route";
import { eventIdParams, eventUpdateSchema } from "@/lib/events/schema";
import { deleteEvent, updateEvent } from "@/lib/repositories";

export const PATCH = apiRoute(
  { minRole: "lead", input: eventUpdateSchema },
  async ({ orgId, input, params }) => {
    const { id } = eventIdParams.parse(params);
    const { date, endDate, assigneeIds, ...rest } = input;

    // updateEvent org-validates assigneeIds itself (see eventRepo's
    // assertAssigneesInOrg) — no need to duplicate the check here.
    const data = {
      ...rest,
      ...(date ? { date: new Date(date) } : {}),
      ...(endDate !== undefined
        ? { endDate: endDate ? new Date(endDate) : null }
        : {}),
      ...(assigneeIds !== undefined ? { assigneeIds } : {}),
    };

    const event = await updateEvent(id, orgId, data);
    if (!event) throw new NotFoundError();
    return event;
  }
);

export const DELETE = apiRoute(
  { minRole: "lead" },
  async ({ orgId, params }) => {
    const { id } = eventIdParams.parse(params);
    const deleted = await deleteEvent(id, orgId);
    if (!deleted) throw new NotFoundError();
    return null;
  }
);

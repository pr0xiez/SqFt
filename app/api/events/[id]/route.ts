import { NotFoundError, ValidationError } from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/route";
import { eventIdParams, eventUpdateSchema } from "@/lib/events/schema";
import { deleteEvent, updateEvent, validateUserIds } from "@/lib/repositories";

export const PATCH = apiRoute(
  { minRole: "lead", input: eventUpdateSchema },
  async ({ orgId, input, params }) => {
    const { id } = eventIdParams.parse(params);
    const { date, endDate, assigneeIds, ...rest } = input;

    if (assigneeIds && assigneeIds.length > 0) {
      const ok = await validateUserIds(orgId, assigneeIds);
      if (!ok) throw new ValidationError("Invalid assignee");
    }

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
    await deleteEvent(id, orgId);
    return null;
  }
);

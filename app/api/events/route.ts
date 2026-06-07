import { ValidationError } from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/route";
import { eventCreateSchema } from "@/lib/events/schema";
import { createEvent, listEvents, validateUserIds } from "@/lib/repositories";

export const GET = apiRoute(async ({ orgId }) => listEvents(orgId));

export const POST = apiRoute(
  { minRole: "lead", input: eventCreateSchema, status: 201 },
  async ({ orgId, input }) => {
    const { endDate, assigneeIds, ...rest } = input;

    if (assigneeIds && assigneeIds.length > 0) {
      const ok = await validateUserIds(orgId, assigneeIds);
      if (!ok) throw new ValidationError("Invalid assignee");
    }

    return createEvent(orgId, {
      ...rest,
      date: new Date(rest.date),
      ...(endDate ? { endDate: new Date(endDate) } : {}),
      ...(assigneeIds ? { assigneeIds } : {}),
    });
  }
);

import { apiRoute } from "@/lib/api/route";
import { eventCreateSchema } from "@/lib/events/schema";
import { createEvent, listEvents } from "@/lib/repositories";

export const GET = apiRoute(async ({ orgId }) => listEvents(orgId));

export const POST = apiRoute(
  { minRole: "lead", input: eventCreateSchema, status: 201 },
  async ({ orgId, input }) => {
    const { endDate, assigneeIds, ...rest } = input;

    // createEvent org-validates assigneeIds itself (see eventRepo's
    // assertAssigneesInOrg) — no need to duplicate the check here.
    return createEvent(orgId, {
      ...rest,
      date: new Date(rest.date),
      ...(endDate ? { endDate: new Date(endDate) } : {}),
      ...(assigneeIds ? { assigneeIds } : {}),
    });
  }
);

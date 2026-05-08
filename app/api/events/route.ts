import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createEvent, listEvents } from "@/lib/repositories";
import { EventValidationError } from "@/lib/repositories/eventRepo";
import { getOrgId } from "@/lib/tenant";
import { withLogging } from "@/lib/with-logging";

const createSchema = z.object({
  type: z.enum(["job", "visit", "other"]),
  title: z.string().min(1).max(200),
  customerId: z.number().int().positive().optional(),
  quoteId: z.number().int().positive().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  crew: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
});

export const GET = withLogging(async () => {
  try {
    const orgId = await getOrgId();
    const events = await listEvents(orgId);
    return NextResponse.json(events);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
});

export const POST = withLogging(async (req: NextRequest) => {
  try {
    const orgId = await getOrgId();
    const body = await req.json();
    const parsed = createSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message },
        { status: 400 }
      );
    }

    const { endDate, ...rest } = parsed.data;
    const event = await createEvent(orgId, {
      ...rest,
      date: new Date(rest.date),
      ...(endDate ? { endDate: new Date(endDate) } : {}),
    });

    return NextResponse.json(event, { status: 201 });
  } catch (err) {
    if (err instanceof EventValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
});

import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { deleteEvent, updateEvent } from "@/lib/repositories";
import { getOrgId } from "@/lib/tenant";
import { withLogging } from "@/lib/with-logging";

const updateSchema = z.object({
  type: z.enum(["job", "visit", "other"]).optional(),
  title: z.string().min(1).max(200).optional(),
  customerId: z.number().int().positive().nullable().optional(),
  estimateId: z.number().int().positive().nullable().optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  startTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  endTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  crew: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

export const PATCH = withLogging(
  async (req: NextRequest, { params }: RouteParams) => {
    try {
      const orgId = await getOrgId();
      const { id } = await params;
      const body = await req.json();
      const parsed = updateSchema.safeParse(body);

      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message },
          { status: 400 }
        );
      }

      const { endDate, ...rest } = parsed.data;
      const data = {
        ...rest,
        ...(rest.date ? { date: new Date(rest.date) } : {}),
        ...(endDate !== undefined
          ? { endDate: endDate ? new Date(endDate) : null }
          : {}),
      };

      const event = await updateEvent(parseInt(id, 10), orgId, data);
      if (!event)
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json(event);
    } catch (err) {
      if (err instanceof Error && err.message === "Unauthorized") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
  }
);

export const DELETE = withLogging(
  async (_req: NextRequest, { params }: RouteParams) => {
    try {
      const orgId = await getOrgId();
      const { id } = await params;
      await deleteEvent(parseInt(id, 10), orgId);
      return NextResponse.json({ ok: true });
    } catch (err) {
      if (err instanceof Error && err.message === "Unauthorized") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
  }
);

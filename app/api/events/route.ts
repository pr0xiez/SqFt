import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOrgId } from "@/lib/tenant";
import { withLogging } from "@/lib/with-logging";

const createSchema = z.object({
  type: z.enum(["job", "visit", "other"]),
  title: z.string().min(1).max(200),
  customerId: z.number().int().positive().optional(),
  estimateId: z.number().int().positive().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  crew: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
});

export const GET = withLogging(async () => {
  try {
    const orgId = await getOrgId();
    const events = await prisma.event.findMany({
      where: { orgId },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      include: {
        customer: { select: { id: true, name: true } },
      },
    });
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

    const event = await prisma.event.create({
      data: {
        ...parsed.data,
        date: new Date(parsed.data.date),
        orgId,
      },
    });

    return NextResponse.json(event, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
});

import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOrgId } from "@/lib/tenant";
import { withLogging } from "@/lib/with-logging";

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  phone: z.string().max(30).optional(),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().max(400).optional(),
  source: z
    .enum(["phone", "online", "referral", "walkin", "website"])
    .optional(),
  notes: z.string().max(2000).optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

export const GET = withLogging(async function (_req: NextRequest, { params }: RouteParams) {
  try {
    const orgId = await getOrgId();
    const { id } = await params;
    const customer = await prisma.customer.findFirst({
      where: { id: parseInt(id, 10), orgId },
      include: {
        estimates: { orderBy: { createdAt: "desc" } },
        _count: { select: { estimates: true } },
      },
    });
    if (!customer)
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(customer);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
});

export const PATCH = withLogging(async function (req: NextRequest, { params }: RouteParams) {
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

    const customer = await prisma.customer.updateMany({
      where: { id: parseInt(id, 10), orgId },
      data: parsed.data,
    });

    if (customer.count === 0)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
});

export const DELETE = withLogging(async function (_req: NextRequest, { params }: RouteParams) {
  try {
    const orgId = await getOrgId();
    const { id } = await params;
    await prisma.customer.deleteMany({
      where: { id: parseInt(id, 10), orgId },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
});

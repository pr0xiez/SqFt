import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOrgId } from "@/lib/tenant";
import { withLogging } from "@/lib/with-logging";

const createSchema = z.object({
  customerId: z.number().int().positive(),
  taxRate: z.number().min(0).max(1).default(0.08),
  markupPct: z.number().min(0).default(0),
  depositPct: z.number().min(0).max(1).default(0.5),
});

export const GET = withLogging(async function () {
  try {
    const orgId = await getOrgId();
    const estimates = await prisma.estimate.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
      include: {
        customer: { select: { id: true, name: true, address: true } },
        _count: { select: { items: true } },
      },
    });
    return NextResponse.json(estimates);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
});

export const POST = withLogging(async function (req: NextRequest) {
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

    const estimate = await prisma.estimate.create({
      data: { ...parsed.data, orgId },
    });

    return NextResponse.json(estimate, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
});

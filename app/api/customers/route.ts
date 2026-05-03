import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgId } from "@/lib/tenant";
import { z } from "zod";

const createSchema = z.object({
  name:    z.string().min(1).max(200),
  phone:   z.string().max(30).optional(),
  email:   z.string().email().optional().or(z.literal("")),
  address: z.string().max(400).optional(),
  source:  z.enum(["phone", "online", "referral", "walkin", "website"]).default("phone"),
  notes:   z.string().max(2000).optional(),
});

export async function GET() {
  try {
    const orgId = await getOrgId();
    const customers = await prisma.customer.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { estimates: true } } },
    });
    return NextResponse.json(customers);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
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

    const customer = await prisma.customer.create({
      data: { ...parsed.data, orgId },
    });

    return NextResponse.json(customer, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

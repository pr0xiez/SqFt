import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgId } from "@/lib/tenant";
import { z } from "zod";

const schema = z.object({
  name: z.string().min(1).max(200),
});

export async function POST(req: NextRequest) {
  try {
    const orgId = await getOrgId();
    const body = await req.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid company name" }, { status: 400 });
    }

    const slug =
      parsed.data.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
        .slice(0, 60) +
      "-" +
      orgId.slice(-6);

    await prisma.organization.update({
      where: { id: orgId },
      data: { name: parsed.data.name, slug },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Org setup error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

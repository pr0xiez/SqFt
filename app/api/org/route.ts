import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgId } from "@/lib/tenant";
import { withLogging } from "@/lib/with-logging";

export const GET = withLogging(async () => {
  try {
    const orgId = await getOrgId();
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: {
        id: true,
        name: true,
        phone: true,
        address: true,
        licenseNumber: true,
        logo: true,
        invoicePrefix: true,
      },
    });
    if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(org);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
});

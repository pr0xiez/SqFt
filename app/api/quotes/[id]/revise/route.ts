import { auth } from "@/lib/auth";
import { reviseQuote, getQuote } from "@/lib/repositories/quoteRepo";
import { getOrgId } from "@/lib/tenant";
import { NextResponse } from "next/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_req: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgId = await getOrgId();
  const { id } = await params;
  const quoteId = Number.parseInt(id, 10);
  if (Number.isNaN(quoteId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const original = await getQuote(quoteId, orgId);
  if (!original) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (original.status !== "accepted" && original.status !== "declined") {
    return NextResponse.json(
      { error: "Only accepted or declined quotes can be revised" },
      { status: 409 }
    );
  }

  const result = await reviseQuote(quoteId, orgId);
  if (!result) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, id: result.id });
}

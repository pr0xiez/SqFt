import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createQuote, listQuotes } from "@/lib/repositories";
import { getOrgId } from "@/lib/tenant";
import { type LineItemCalc, quoteTotal, type RoomItem } from "@/lib/utils";
import { withLogging } from "@/lib/with-logging";

const createSchema = z.object({
  estimateId: z.number().int().positive(),
});

export const GET = withLogging(async () => {
  try {
    const orgId = await getOrgId();
    const quotes = await listQuotes(orgId);
    const out = quotes.map(({ lineItems, estimate, ...rest }) => {
      const { items, ...estimateRest } = estimate;
      return {
        ...rest,
        estimate: estimateRest,
        total: quoteTotal({
          lineItems: lineItems as LineItemCalc[],
          estimate: { items: items as RoomItem[] },
          markupPct: rest.markupPct,
          taxRate: rest.taxRate,
        }),
      };
    });
    return NextResponse.json(out);
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

    const quote = await createQuote(orgId, parsed.data);
    if (!quote) {
      return NextResponse.json(
        { error: "Estimate not found" },
        { status: 404 }
      );
    }
    return NextResponse.json(quote, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
});

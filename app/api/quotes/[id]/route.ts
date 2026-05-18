import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logError } from "@/lib/logger";
import {
  deleteQuote,
  getQuote,
  QuoteHasEventsError,
  saveQuote,
} from "@/lib/repositories";
import { getOrgId } from "@/lib/tenant";
import { withLogging } from "@/lib/with-logging";

const lineItemSchema = z.object({
  id: z.number().int().optional(),
  name: z.string(),
  description: z.string().nullish(),
  rate: z.number(),
  qtyMode: z.enum(["manual", "linked"]).default("manual"),
  qty: z.number().nullish(),
  wastePct: z.number().default(0),
  unitLabel: z.string().default("ft²"),
  linkedRoomIds: z.array(z.number().int()).default([]),
  sortOrder: z.number().int().default(0),
});

const updateSchema = z.object({
  status: z.enum(["draft", "sent", "accepted", "declined"]).optional(),
  convenienceFeeRate: z.number().min(0).max(1).optional(),
  markupPct: z.number().min(0).optional(),
  depositPct: z.number().min(0).max(1).optional(),
  lineItems: z.array(lineItemSchema).optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

export const GET = withLogging(
  async (_req: NextRequest, { params }: RouteParams) => {
    try {
      const orgId = await getOrgId();
      const { id } = await params;
      const quote = await getQuote(parseInt(id, 10), orgId);
      if (!quote)
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json(quote);
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
);

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

      const quoteId = parseInt(id, 10);
      const existing = await getQuote(quoteId, orgId);
      if (!existing)
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      if (existing.status === "accepted" || existing.status === "declined") {
        return NextResponse.json(
          { error: `Quote is locked (status: ${existing.status})` },
          { status: 409 }
        );
      }

      const quote = await saveQuote(quoteId, orgId, parsed.data);
      if (!quote)
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json(quote);
    } catch (err) {
      if (err instanceof Error && err.message === "Unauthorized") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      logError({
        errorMessage: err instanceof Error ? err.message : "Unknown error",
        err,
      });
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
  }
);

export const DELETE = withLogging(
  async (_req: NextRequest, { params }: RouteParams) => {
    try {
      const orgId = await getOrgId();
      const { id } = await params;
      await deleteQuote(parseInt(id, 10), orgId);
      return NextResponse.json({ ok: true });
    } catch (err) {
      if (err instanceof QuoteHasEventsError) {
        return NextResponse.json(
          {
            error: `Reassign or delete the ${err.eventCount} scheduled job(s) for this quote first.`,
          },
          { status: 409 }
        );
      }
      if (err instanceof Error && err.message === "Unauthorized") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
  }
);

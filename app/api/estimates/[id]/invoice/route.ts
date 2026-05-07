import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logError } from "@/lib/logger";
import { markEstimateAsInvoice } from "@/lib/repositories";
import { getOrgId } from "@/lib/tenant";
import { withLogging } from "@/lib/with-logging";

const invoiceBodySchema = z
  .object({
    dueDate: z.string().datetime().optional(),
    netDays: z.number().int().min(0).max(365).optional(),
  })
  .optional();

type RouteParams = { params: Promise<{ id: string }> };

export const POST = withLogging(
  async (req: NextRequest, { params }: RouteParams) => {
    try {
      const orgId = await getOrgId();
      const { id } = await params;

      let opts: { dueDate?: Date; netDays?: number } | undefined;
      const text = await req.text();
      if (text.length > 0) {
        const parsed = invoiceBodySchema.safeParse(JSON.parse(text));
        if (!parsed.success) {
          return NextResponse.json(
            { error: parsed.error.issues[0]?.message },
            { status: 400 }
          );
        }
        opts = parsed.data
          ? {
              dueDate: parsed.data.dueDate
                ? new Date(parsed.data.dueDate)
                : undefined,
              netDays: parsed.data.netDays,
            }
          : undefined;
      }

      const result = await markEstimateAsInvoice(parseInt(id, 10), orgId, opts);

      if (result.ok) return NextResponse.json(result.estimate);

      switch (result.reason) {
        case "not_found":
          return NextResponse.json({ error: "Not found" }, { status: 404 });
        case "already_invoiced":
          return NextResponse.json(
            { error: "Estimate is already invoiced" },
            { status: 409 }
          );
        case "invalid_status":
          return NextResponse.json(
            {
              error:
                "Estimate must be scheduled or later before it can be invoiced",
            },
            { status: 409 }
          );
      }
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

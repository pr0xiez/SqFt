import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logError } from "@/lib/logger";
import { deleteEstimate, getEstimate, saveEstimate } from "@/lib/repositories";
import { getOrgId } from "@/lib/tenant";
import { withLogging } from "@/lib/with-logging";

const lshapeSectionSchema = z.object({
  w: z.union([z.string(), z.number()]),
  l: z.union([z.string(), z.number()]),
});

const lshapeDeductSchema = z.object({
  w: z.union([z.string(), z.number()]),
  l: z.union([z.string(), z.number()]),
  label: z.string().optional(),
});

const estimateItemSchema = z.object({
  id: z.number().int(),
  type: z.enum(["room", "note"]),
  sortOrder: z.number().int().default(0),
  name: z.string().nullish(),
  shape: z.enum(["rect", "tri", "lshape"]).nullish(),
  w: z.number().nullish(),
  l: z.number().nullish(),
  lshapeData: z
    .object({
      sections: z.array(lshapeSectionSchema),
      deductions: z.array(lshapeDeductSchema),
    })
    .nullish(),
  note: z.string().nullish(),
  text: z.string().nullish(),
});

const lineItemSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  rate: z.number(),
  qtyMode: z.enum(["manual", "linked"]).default("manual"),
  qty: z.number().nullish(),
  wastePct: z.number().default(0),
  unitLabel: z.string().default("ft²"),
  linkedRoomIds: z.array(z.number().int()).default([]),
  sortOrder: z.number().int().default(0),
});

const updateSchema = z.object({
  title: z.string().max(200).optional(),
  status: z.enum(["quote", "scheduled", "in_progress", "completed"]).optional(),
  taxRate: z.number().min(0).max(1).optional(),
  markupPct: z.number().min(0).optional(),
  depositPct: z.number().min(0).max(1).optional(),
  items: z.array(estimateItemSchema).optional(),
  lineItems: z.array(lineItemSchema).optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

export const GET = withLogging(
  async (_req: NextRequest, { params }: RouteParams) => {
    try {
      const orgId = await getOrgId();
      const { id } = await params;
      const estimate = await getEstimate(parseInt(id, 10), orgId);
      if (!estimate)
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json(estimate);
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

      const estimate = await saveEstimate(parseInt(id, 10), orgId, parsed.data);
      if (!estimate)
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json(estimate);
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
      await deleteEstimate(parseInt(id, 10), orgId);
      return NextResponse.json({ ok: true });
    } catch (err) {
      if (err instanceof Error && err.message === "Unauthorized") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
  }
);

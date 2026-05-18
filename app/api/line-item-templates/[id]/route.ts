import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  deleteLineItemTemplate,
  updateLineItemTemplate,
} from "@/lib/repositories";
import { getOrgId } from "@/lib/tenant";
import { withLogging } from "@/lib/with-logging";

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullish(),
  rate: z.number().min(0).optional(),
  unitLabel: z.string().max(40).optional(),
  archived: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

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
      const template = await updateLineItemTemplate(
        parseInt(id, 10),
        orgId,
        parsed.data
      );
      if (!template)
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json(template);
    } catch (err) {
      if (err instanceof Error && err.message === "Unauthorized") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
  }
);

export const DELETE = withLogging(
  async (_req: NextRequest, { params }: RouteParams) => {
    try {
      const orgId = await getOrgId();
      const { id } = await params;
      const result = await deleteLineItemTemplate(parseInt(id, 10), orgId);
      if (!result.ok)
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ ok: true });
    } catch (err) {
      if (err instanceof Error && err.message === "Unauthorized") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
  }
);

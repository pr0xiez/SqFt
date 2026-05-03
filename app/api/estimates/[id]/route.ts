import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgId } from "@/lib/tenant";
import { z } from "zod";

const lshapeSectionSchema = z.object({
  w: z.union([z.string(), z.number()]),
  l: z.union([z.string(), z.number()]),
});

const lshapeDeductSchema = z.object({
  w:     z.union([z.string(), z.number()]),
  l:     z.union([z.string(), z.number()]),
  label: z.string().optional(),
});

const estimateItemSchema = z.object({
  id:         z.number().int(),
  type:       z.enum(["room", "note"]),
  sortOrder:  z.number().int().default(0),
  name:       z.string().optional(),
  shape:      z.enum(["rect", "tri", "lshape"]).optional(),
  w:          z.number().optional(),
  l:          z.number().optional(),
  lshapeData: z.object({ sections: z.array(lshapeSectionSchema), deductions: z.array(lshapeDeductSchema) }).optional(),
  note:       z.string().optional(),
  text:       z.string().optional(),
});

const lineItemSchema = z.object({
  id:            z.number().int(),
  name:          z.string(),
  rate:          z.number(),
  qtyMode:       z.enum(["manual", "linked"]).default("manual"),
  qty:           z.number().optional(),
  wastePct:      z.number().default(0),
  unitLabel:     z.string().default("ft²"),
  linkedRoomIds: z.array(z.number().int()).default([]),
  sortOrder:     z.number().int().default(0),
});

const updateSchema = z.object({
  status:    z.enum(["quote", "scheduled", "in_progress", "completed"]).optional(),
  taxRate:   z.number().min(0).max(1).optional(),
  markupPct: z.number().min(0).optional(),
  depositPct:z.number().min(0).max(1).optional(),
  items:     z.array(estimateItemSchema).optional(),
  lineItems: z.array(lineItemSchema).optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const orgId = await getOrgId();
    const { id } = await params;
    const estimate = await prisma.estimate.findFirst({
      where: { id: parseInt(id), orgId },
      include: {
        customer: true,
        items: { orderBy: { sortOrder: "asc" } },
        lineItems: { orderBy: { sortOrder: "asc" } },
      },
    });
    if (!estimate) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(estimate);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const orgId = await getOrgId();
    const { id } = await params;
    const estimateId = parseInt(id);
    const body = await req.json();
    const parsed = updateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    }

    const { items, lineItems, ...topLevel } = parsed.data;

    // Update top-level fields
    await prisma.estimate.updateMany({ where: { id: estimateId, orgId }, data: topLevel });

    // Replace items if provided (delete-and-recreate for simplicity)
    if (items !== undefined) {
      await prisma.estimateItem.deleteMany({ where: { estimateId } });
      if (items.length > 0) {
        await prisma.estimateItem.createMany({
          data: items.map(({ id: _id, ...item }) => ({ ...item, estimateId })),
        });
      }
    }

    // Replace line items if provided
    if (lineItems !== undefined) {
      await prisma.lineItem.deleteMany({ where: { estimateId } });
      if (lineItems.length > 0) {
        await prisma.lineItem.createMany({
          data: lineItems.map(({ id: _id, ...li }) => ({ ...li, estimateId })),
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const orgId = await getOrgId();
    const { id } = await params;
    await prisma.estimate.deleteMany({ where: { id: parseInt(id), orgId } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

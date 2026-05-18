import type { LineItemTemplate } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export type { LineItemTemplate };

export async function listLineItemTemplates(
  orgId: string,
  opts: { includeArchived?: boolean } = {}
): Promise<LineItemTemplate[]> {
  return prisma.lineItemTemplate.findMany({
    where: { orgId, ...(opts.includeArchived ? {} : { archived: false }) },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export async function createLineItemTemplate(
  orgId: string,
  data: {
    name: string;
    description?: string | null;
    rate?: number;
    unitLabel?: string;
  }
): Promise<LineItemTemplate> {
  return prisma.lineItemTemplate.create({
    data: {
      orgId,
      name: data.name,
      description: data.description ?? null,
      rate: data.rate ?? 0,
      unitLabel: data.unitLabel ?? "ft²",
    },
  });
}

export async function updateLineItemTemplate(
  id: number,
  orgId: string,
  data: {
    name?: string;
    description?: string | null;
    rate?: number;
    unitLabel?: string;
    archived?: boolean;
    sortOrder?: number;
  }
): Promise<LineItemTemplate | null> {
  const result = await prisma.lineItemTemplate.updateMany({
    where: { id, orgId },
    data,
  });
  if (result.count === 0) return null;
  return prisma.lineItemTemplate.findFirst({ where: { id, orgId } });
}

export async function deleteLineItemTemplate(
  id: number,
  orgId: string
): Promise<{ ok: boolean }> {
  const result = await prisma.lineItemTemplate.deleteMany({
    where: { id, orgId },
  });
  return { ok: result.count > 0 };
}

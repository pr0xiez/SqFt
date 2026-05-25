import { z } from "zod";
import {
  CannotDemoteSelfError,
  LastAdminError,
  NotFoundError,
} from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/route";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenant";

const PatchBody = z
  .object({ role: z.enum(["admin", "lead", "crew"]) })
  .strict();

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  createdAt: true,
} as const;

export const PATCH = apiRoute(
  { minRole: "admin", input: PatchBody },
  async ({ orgId, input, params }) => {
    const session = await requireSession();
    const targetId = (params as { id: string }).id;

    if (targetId === session.user.id && input.role !== "admin") {
      throw new CannotDemoteSelfError();
    }

    const target = await prisma.user.findFirst({
      where: { id: targetId, orgId },
      select: { id: true, role: true },
    });
    if (!target) throw new NotFoundError();

    if (target.role === "admin" && input.role !== "admin") {
      const adminCount = await prisma.user.count({
        where: { orgId, role: "admin" },
      });
      if (adminCount <= 1) throw new LastAdminError();
    }

    return prisma.user.update({
      where: { id: targetId },
      data: { role: input.role },
      select: USER_SELECT,
    });
  }
);

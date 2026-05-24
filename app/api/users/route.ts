import { apiRoute } from "@/lib/api/route";
import { prisma } from "@/lib/prisma";

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  createdAt: true,
} as const;

export const GET = apiRoute({ minRole: "admin" }, async ({ orgId }) => {
  return prisma.user.findMany({
    where: { orgId },
    select: USER_SELECT,
    orderBy: { createdAt: "asc" },
  });
});

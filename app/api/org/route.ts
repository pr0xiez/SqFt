import { NotFoundError } from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/route";
import { prisma } from "@/lib/prisma";

export const GET = apiRoute(async ({ orgId }) => {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: {
      id: true,
      name: true,
      phone: true,
      address: true,
      licenseNumber: true,
      logo: true,
    },
  });
  if (!org) throw new NotFoundError();
  return org;
});

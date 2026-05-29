import { NotFoundError } from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/route";
import { createSiteMeasure, listSiteMeasures } from "@/lib/repositories";
import { estimateCreateSchema } from "@/lib/siteMeasures/schema";

export const GET = apiRoute({ minRole: "lead" }, async ({ orgId }) =>
  listSiteMeasures(orgId)
);

export const POST = apiRoute(
  { minRole: "lead", input: estimateCreateSchema, status: 201 },
  async ({ orgId, input }) => {
    const siteMeasure = await createSiteMeasure(orgId, input);
    if (!siteMeasure) throw new NotFoundError("Location not found");
    return siteMeasure;
  }
);

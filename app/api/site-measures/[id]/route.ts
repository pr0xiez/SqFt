import { NotFoundError } from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/route";
import {
  deleteSiteMeasure,
  getSiteMeasure,
  saveSiteMeasure,
} from "@/lib/repositories";
import {
  estimateIdParams,
  estimateUpdateSchema,
} from "@/lib/siteMeasures/schema";

export const GET = apiRoute({ minRole: "lead" }, async ({ orgId, params }) => {
  const { id } = estimateIdParams.parse(params);
  const siteMeasure = await getSiteMeasure(id, orgId);
  if (!siteMeasure) throw new NotFoundError();
  return siteMeasure;
});

export const PATCH = apiRoute(
  { minRole: "lead", input: estimateUpdateSchema },
  async ({ orgId, input, params }) => {
    const { id } = estimateIdParams.parse(params);
    const siteMeasure = await saveSiteMeasure(id, orgId, input);
    if (!siteMeasure) throw new NotFoundError();
    return siteMeasure;
  }
);

export const DELETE = apiRoute(
  { minRole: "lead" },
  async ({ orgId, params }) => {
    const { id } = estimateIdParams.parse(params);
    const deleted = await deleteSiteMeasure(id, orgId);
    if (!deleted) throw new NotFoundError();
    return null;
  }
);

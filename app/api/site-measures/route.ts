import { NotFoundError } from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/route";
import { parsePageParams } from "@/lib/pagination/params";
import {
  createSiteMeasure,
  listSiteMeasures,
  type SiteMeasureSortKey,
  type SiteMeasureStatusFilter,
} from "@/lib/repositories";
import { estimateCreateSchema } from "@/lib/siteMeasures/schema";

const SM_SORT_KEYS = [
  "id",
  "customer",
  "date",
] as const satisfies readonly SiteMeasureSortKey[];

const SM_STATUS = ["all", "empty", "measured", "estimated"] as const;

export const GET = apiRoute({ minRole: "lead" }, async ({ req, orgId }) => {
  const { page, perPage, sort, q } = parsePageParams(req.nextUrl, {
    validSortKeys: SM_SORT_KEYS,
    defaultSort: { key: "date", direction: "desc" },
  });
  const statusParam = req.nextUrl.searchParams.get("status");
  const status: SiteMeasureStatusFilter =
    statusParam && (SM_STATUS as readonly string[]).includes(statusParam)
      ? (statusParam as SiteMeasureStatusFilter)
      : "all";

  return listSiteMeasures(orgId, { page, perPage, sort, q, status });
});

export const POST = apiRoute(
  { minRole: "lead", input: estimateCreateSchema, status: 201 },
  async ({ orgId, input }) => {
    const siteMeasure = await createSiteMeasure(orgId, input);
    if (!siteMeasure) throw new NotFoundError("Location not found");
    return siteMeasure;
  }
);

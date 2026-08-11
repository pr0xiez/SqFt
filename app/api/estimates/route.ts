import {
  ESTIMATE_STATUS_FILTERS,
  type EstimateStatusFilter,
} from "@/components/estimates/filterEstimates";
import { NotFoundError } from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/route";
import { estimateCreateSchema } from "@/lib/estimates/schema";
import { parsePageParams } from "@/lib/pagination/params";
import {
  createEstimate,
  type EstimateSortKey,
  listEstimates,
} from "@/lib/repositories";

const ESTIMATE_SORT_KEYS = [
  "number",
  "customer",
  "siteMeasure",
  "total",
  "status",
  "date",
] as const satisfies readonly EstimateSortKey[];

export const GET = apiRoute({ minRole: "lead" }, async ({ req, orgId }) => {
  const { page, perPage, sort, q } = parsePageParams(req.nextUrl, {
    validSortKeys: ESTIMATE_SORT_KEYS,
    defaultSort: { key: "date", direction: "desc" },
  });
  const statusParam = req.nextUrl.searchParams.get("status");
  const status: EstimateStatusFilter =
    statusParam &&
    (ESTIMATE_STATUS_FILTERS as readonly string[]).includes(statusParam)
      ? (statusParam as EstimateStatusFilter)
      : "all";

  const { items, total, facets } = await listEstimates(orgId, {
    page,
    perPage,
    sort,
    q,
    status,
  });

  return {
    items: items.map((estimate) => {
      const {
        lineItems: _lineItems,
        siteMeasure,
        total: rowTotal,
        ...rest
      } = estimate;
      const { items: _items, ...siteMeasureRest } = siteMeasure;
      return { ...rest, siteMeasure: siteMeasureRest, total: rowTotal };
    }),
    total,
    facets,
  };
});

export const POST = apiRoute(
  { minRole: "lead", input: estimateCreateSchema, status: 201 },
  async ({ orgId, input }) => {
    const estimate = await createEstimate(orgId, input);
    if (!estimate) throw new NotFoundError("Site measure not found");
    return estimate;
  }
);

import { NotFoundError } from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/route";
import { ESTIMATE_STATUS_FILTERS } from "@/lib/estimateStatus";
import { estimateCreateSchema } from "@/lib/estimates/schema";
import type { EstimateStatusFilter } from "@/lib/estimates/statusFilter";
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

  const customerIdParam = Number(req.nextUrl.searchParams.get("customerId"));
  const customerId =
    Number.isInteger(customerIdParam) && customerIdParam > 0
      ? customerIdParam
      : undefined;

  const { items, total, facets } = await listEstimates(orgId, {
    page,
    perPage,
    sort,
    q,
    status,
    customerId,
  });

  return { items, total, facets };
});

export const POST = apiRoute(
  { minRole: "lead", input: estimateCreateSchema, status: 201 },
  async ({ orgId, input }) => {
    const estimate = await createEstimate(orgId, input);
    if (!estimate) throw new NotFoundError("Site measure not found");
    // A freshly created estimate never has an approval token yet (only
    // rotateApprovalToken / reviseEstimate mint one) — no need to query.
    return { ...estimate, hasApprovalToken: false };
  }
);

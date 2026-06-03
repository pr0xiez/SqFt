import { apiRoute } from "@/lib/api/route";
import { customerCreateSchema } from "@/lib/customers/schema";
import { parsePageParams } from "@/lib/pagination/params";
import {
  type CustomerPipelineFilter,
  type CustomerSortKey,
  createCustomer,
  listCustomers,
} from "@/lib/repositories";

const CUSTOMER_SORT_KEYS = [
  "name",
  "source",
  "siteMeasures",
  "open",
  "createdAt",
] as const satisfies readonly CustomerSortKey[];

const CUSTOMER_PIPELINE = ["any", "open", "accepted", "cold"] as const;

export const GET = apiRoute({ minRole: "lead" }, async ({ req, orgId }) => {
  const { page, perPage, sort, q } = parsePageParams(req.nextUrl, {
    validSortKeys: CUSTOMER_SORT_KEYS,
    defaultSort: { key: "createdAt", direction: "desc" },
  });
  const sp = req.nextUrl.searchParams;
  const source = sp.get("source") ?? "all";
  const pipelineParam = sp.get("pipeline");
  const pipeline: CustomerPipelineFilter =
    pipelineParam &&
    (CUSTOMER_PIPELINE as readonly string[]).includes(pipelineParam)
      ? (pipelineParam as CustomerPipelineFilter)
      : "any";

  return listCustomers(orgId, { page, perPage, sort, q, source, pipeline });
});

export const POST = apiRoute(
  { minRole: "lead", input: customerCreateSchema, status: 201 },
  async ({ orgId, input }) => createCustomer(orgId, input)
);

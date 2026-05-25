import { apiRoute } from "@/lib/api/route";
import { lineItemTemplateCreateSchema } from "@/lib/lineItemTemplates/schema";
import {
  createLineItemTemplate,
  listLineItemTemplates,
} from "@/lib/repositories";

export const GET = apiRoute({ minRole: "lead" }, async ({ orgId, req }) => {
  const includeArchived =
    req.nextUrl.searchParams.get("includeArchived") === "1";
  return listLineItemTemplates(orgId, { includeArchived });
});

export const POST = apiRoute(
  { minRole: "lead", input: lineItemTemplateCreateSchema, status: 201 },
  async ({ orgId, input }) => createLineItemTemplate(orgId, input)
);

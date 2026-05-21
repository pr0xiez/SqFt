import { NotFoundError } from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/route";
import {
  lineItemTemplateIdParams,
  lineItemTemplateUpdateSchema,
} from "@/lib/lineItemTemplates/schema";
import {
  deleteLineItemTemplate,
  updateLineItemTemplate,
} from "@/lib/repositories";

export const PATCH = apiRoute(
  { input: lineItemTemplateUpdateSchema },
  async ({ orgId, input, params }) => {
    const { id } = lineItemTemplateIdParams.parse(params);
    const template = await updateLineItemTemplate(id, orgId, input);
    if (!template) throw new NotFoundError();
    return template;
  }
);

export const DELETE = apiRoute(async ({ orgId, params }) => {
  const { id } = lineItemTemplateIdParams.parse(params);
  const result = await deleteLineItemTemplate(id, orgId);
  if (!result.ok) throw new NotFoundError();
  return null;
});

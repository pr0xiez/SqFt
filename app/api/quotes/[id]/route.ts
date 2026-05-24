import { NotFoundError } from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/route";
import { quoteIdParams, quoteUpdateSchema } from "@/lib/quotes/schema";
import { deleteQuote, getQuote, saveQuote } from "@/lib/repositories";

export const GET = apiRoute({ minRole: "lead" }, async ({ orgId, params }) => {
  const { id } = quoteIdParams.parse(params);
  const quote = await getQuote(id, orgId);
  if (!quote) throw new NotFoundError();
  return quote;
});

export const PATCH = apiRoute(
  { minRole: "lead", input: quoteUpdateSchema },
  async ({ orgId, input, params }) => {
    const { id } = quoteIdParams.parse(params);
    const quote = await saveQuote(id, orgId, input);
    if (!quote) throw new NotFoundError();
    return quote;
  }
);

export const DELETE = apiRoute(
  { minRole: "lead" },
  async ({ orgId, params }) => {
    const { id } = quoteIdParams.parse(params);
    await deleteQuote(id, orgId);
    return null;
  }
);

import { NotFoundError } from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/route";
import { quoteCreateSchema } from "@/lib/quotes/schema";
import { computeQuoteView, fromPrismaQuote } from "@/lib/quoteView";
import { createQuote, listQuotes } from "@/lib/repositories";

export const GET = apiRoute({ minRole: "lead" }, async ({ orgId }) => {
  const quotes = await listQuotes(orgId);
  return quotes.map((quote) => {
    const { lineItems: _lineItems, estimate, ...rest } = quote;
    const { items: _items, ...estimateRest } = estimate;
    const view = computeQuoteView(fromPrismaQuote(quote));
    return {
      ...rest,
      estimate: estimateRest,
      total: quote._count.lineItems === 0 ? null : view.total,
    };
  });
});

export const POST = apiRoute(
  { minRole: "lead", input: quoteCreateSchema, status: 201 },
  async ({ orgId, input }) => {
    const quote = await createQuote(orgId, input);
    if (!quote) throw new NotFoundError("Estimate not found");
    return quote;
  }
);

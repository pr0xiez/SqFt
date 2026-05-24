import { ConflictError, NotFoundError } from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/route";
import { quoteIdParams } from "@/lib/quotes/schema";
import { getQuote, reviseQuote } from "@/lib/repositories";

export const POST = apiRoute({ minRole: "lead" }, async ({ orgId, params }) => {
  const { id } = quoteIdParams.parse(params);

  const original = await getQuote(id, orgId);
  if (!original) throw new NotFoundError();
  if (original.status !== "accepted" && original.status !== "declined") {
    throw new ConflictError("Only accepted or declined quotes can be revised");
  }

  const result = await reviseQuote(id, orgId);
  if (!result) throw new NotFoundError();
  return { ok: true, id: result.id };
});

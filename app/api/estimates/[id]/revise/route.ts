import { NotFoundError } from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/route";
import { estimateIdParams } from "@/lib/estimates/schema";
import { reviseEstimate } from "@/lib/repositories";

// reviseEstimate enforces the "only approved or declined estimates can be
// revised" lifecycle guard itself (throws ConflictError) — this route is a
// thin caller.
export const POST = apiRoute({ minRole: "lead" }, async ({ orgId, params }) => {
  const { id } = estimateIdParams.parse(params);

  const result = await reviseEstimate(id, orgId);
  if (!result) throw new NotFoundError();
  return { ok: true, id: result.id };
});

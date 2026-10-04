import { NotFoundError } from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/route";
import { customerIdParams } from "@/lib/customers/schema";
import { getCustomerActivity } from "@/lib/repositories";

export const GET = apiRoute({ minRole: "lead" }, async ({ orgId, params }) => {
  const { id } = customerIdParams.parse(params);
  const activity = await getCustomerActivity(orgId, id);
  if (!activity) throw new NotFoundError();
  return activity;
});

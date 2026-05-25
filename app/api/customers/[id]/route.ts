import { NotFoundError } from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/route";
import { customerIdParams, customerUpdateSchema } from "@/lib/customers/schema";
import {
  deleteCustomer,
  getCustomer,
  updateCustomer,
} from "@/lib/repositories";

export const GET = apiRoute({ minRole: "lead" }, async ({ orgId, params }) => {
  const { id } = customerIdParams.parse(params);
  const customer = await getCustomer(id, orgId);
  if (!customer) throw new NotFoundError();
  return customer;
});

export const PATCH = apiRoute(
  { minRole: "lead", input: customerUpdateSchema },
  async ({ orgId, input, params }) => {
    const { id } = customerIdParams.parse(params);
    const customer = await updateCustomer(id, orgId, input);
    if (!customer) throw new NotFoundError();
    return customer;
  }
);

export const DELETE = apiRoute(
  { minRole: "lead" },
  async ({ orgId, params }) => {
    const { id } = customerIdParams.parse(params);
    const deleted = await deleteCustomer(id, orgId);
    if (!deleted) throw new NotFoundError();
    return null;
  }
);

import { apiRoute } from "@/lib/api/route";
import { customerCreateSchema } from "@/lib/customers/schema";
import { createCustomer, listCustomers } from "@/lib/repositories";

export const GET = apiRoute({ minRole: "lead" }, async ({ orgId }) =>
  listCustomers(orgId)
);

export const POST = apiRoute(
  { minRole: "lead", input: customerCreateSchema, status: 201 },
  async ({ orgId, input }) => createCustomer(orgId, input)
);

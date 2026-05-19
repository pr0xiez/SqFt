import { apiRoute } from "@/lib/api/route";
import { customerCreateSchema } from "@/lib/customers/schema";
import { createCustomer, listCustomers } from "@/lib/repositories";

export const GET = apiRoute(async ({ orgId }) => listCustomers(orgId));

export const POST = apiRoute(
  { input: customerCreateSchema, status: 201 },
  async ({ orgId, input }) => createCustomer(orgId, input)
);

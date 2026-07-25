import type { NextRequest } from "next/server";
import { isMockQboEnabled } from "@/lib/qbo/config";
import {
  fault,
  handleEntityRead,
  handleEntityWrite,
  handleQuery,
  json,
  MOCK_COMPANY_NAME,
} from "@/lib/qbo/mockRealm";

/** The mock Accounting API surface: query, companyinfo, entity read/write. */

type Ctx = { params: Promise<{ realmId: string; path: string[] }> };

export async function GET(req: NextRequest, ctx: Ctx): Promise<Response> {
  if (!isMockQboEnabled()) return new Response(null, { status: 404 });
  const { realmId, path } = await ctx.params;
  const [head, id] = path;

  if (head === "query") {
    const query = req.nextUrl.searchParams.get("query") ?? "";
    return handleQuery(realmId, query);
  }
  if (head === "companyinfo") {
    return json({ CompanyInfo: { CompanyName: MOCK_COMPANY_NAME } });
  }
  if (head && id) {
    return handleEntityRead(realmId, head, id);
  }
  return fault(400, "4000", `Unsupported mock GET /${path.join("/")}`);
}

export async function POST(req: NextRequest, ctx: Ctx): Promise<Response> {
  if (!isMockQboEnabled()) return new Response(null, { status: 404 });
  const { realmId, path } = await ctx.params;
  const [head] = path;
  const body = (await req.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!head || !body) {
    return fault(400, "4000", "Missing entity path or body");
  }
  const operation = req.nextUrl.searchParams.get("operation");
  return handleEntityWrite(realmId, head, operation, body);
}

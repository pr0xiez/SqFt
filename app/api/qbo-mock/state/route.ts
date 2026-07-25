import type { NextRequest } from "next/server";
import { isMockQboEnabled } from "@/lib/qbo/config";
import { json, loadRealm } from "@/lib/qbo/mockRealm";

/** E2E assertion endpoint: the raw realm blob (entities as stored). */
export async function GET(req: NextRequest): Promise<Response> {
  if (!isMockQboEnabled()) return new Response(null, { status: 404 });
  const realmId = req.nextUrl.searchParams.get("realmId");
  if (!realmId) return json({ error: "realmId required" }, 400);
  return json(await loadRealm(realmId));
}

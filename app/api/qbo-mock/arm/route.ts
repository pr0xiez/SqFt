import type { NextRequest } from "next/server";
import { isMockQboEnabled } from "@/lib/qbo/config";
import {
  armFailures,
  json,
  MOCK_REALM_ID,
  resetRealm,
} from "@/lib/qbo/mockRealm";

/** E2E control endpoint: arm N failing writes, or reset the realm. */
export async function POST(req: NextRequest): Promise<Response> {
  if (!isMockQboEnabled()) return new Response(null, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as {
    realmId?: string;
    failNextWrites?: number;
    reset?: boolean;
  };
  const realmId = body.realmId ?? MOCK_REALM_ID;
  if (body.reset) await resetRealm(realmId);
  if (typeof body.failNextWrites === "number") {
    await armFailures(realmId, body.failNextWrites);
  }
  return json({ ok: true });
}

import { isMockQboEnabled } from "@/lib/qbo/config";
import { json } from "@/lib/qbo/mockRealm";

/** Mock token endpoint. Every grant succeeds and rotates the pair —
 *  mirroring Intuit's always-rotate behavior. */
export async function POST(req: Request): Promise<Response> {
  if (!isMockQboEnabled()) return new Response(null, { status: 404 });
  const form = new URLSearchParams(await req.text());
  const grant = form.get("grant_type");
  if (grant !== "authorization_code" && grant !== "refresh_token") {
    return json({ error: "unsupported_grant_type" }, 400);
  }
  const suffix = Date.now().toString(36);
  return json({
    access_token: `mock-access-${suffix}`,
    refresh_token: `mock-refresh-${suffix}`,
    expires_in: 3600,
    x_refresh_token_expires_in: 100 * 24 * 3600,
    token_type: "bearer",
  });
}

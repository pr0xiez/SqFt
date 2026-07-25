import type { NextRequest } from "next/server";
import { isMockQboEnabled } from "@/lib/qbo/config";

/** Mock Intuit authorize page: one button that "grants" access and
 *  redirects back to the app's callback with a code + realm. Each authorize
 *  mints a fresh realm id (QboConnection.realmId is globally unique, so a
 *  fixed id would collide across test orgs); pass ?realmId= to pin one. */
export function GET(req: NextRequest): Response {
  if (!isMockQboEnabled()) return new Response(null, { status: 404 });

  const params = req.nextUrl.searchParams;
  const redirectUri = params.get("redirect_uri") ?? "";
  const state = params.get("state") ?? "";
  const realmId =
    params.get("realmId") ??
    `mock-realm-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
  const target = new URL(redirectUri);
  target.searchParams.set("code", "mock-auth-code");
  target.searchParams.set("state", state);
  target.searchParams.set("realmId", realmId);

  const html = `<!doctype html>
<html><head><title>Mock Intuit — Authorize</title></head>
<body style="font-family:sans-serif;padding:3rem;max-width:30rem;margin:auto">
  <h1>Mock QuickBooks</h1>
  <p>SqFt is requesting access to <strong>Mock Flooring Co</strong>.</p>
  <a id="qbo-mock-authorize" href="${target.toString()}"
     style="display:inline-block;background:#2ca01c;color:#fff;padding:0.75rem 1.5rem;border-radius:0.375rem;text-decoration:none">
    Authorize
  </a>
</body></html>`;
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

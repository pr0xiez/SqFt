import { NextResponse } from "next/server";
import { toErrorEnvelope, UnauthorizedError } from "@/lib/api/errors";
import { auth } from "@/lib/auth";
import { maskTokenPath } from "@/lib/logger";
import { isPublicReviewPath } from "@/lib/publicRoutes";

export default auth((req) => {
  if (req.nextUrl.pathname.startsWith("/api/")) {
    console.log(
      JSON.stringify({
        type: "proxy_request",
        ts: new Date().toISOString(),
        method: req.method,
        // Masked: the raw pathname can carry a public estimate/invoice
        // review token (the sole credential for those routes — see
        // lib/publicRoutes.ts), evaluated here before the allowlist check
        // below even knows the route is a public review route.
        path: maskTokenPath(req.nextUrl.pathname),
        isAuthenticated: !!req.auth,
        env: process.env.NODE_ENV,
      })
    );
  }

  const isAuth = !!req.auth;
  const isAuthRoute = req.nextUrl.pathname.startsWith("/login");
  const isApiAuth = req.nextUrl.pathname.startsWith("/api/auth");

  // Allow auth API routes and public token-authed review pages (estimate +
  // invoice) through unconditionally — the token in the URL is the credential.
  // The allowlist lives in lib/publicRoutes.ts; any new public surface must be
  // added there.
  if (isApiAuth || isPublicReviewPath(req.nextUrl.pathname))
    return NextResponse.next();

  const isApiRoute = req.nextUrl.pathname.startsWith("/api/");

  // API routes: return 401 rather than redirecting (non-browser clients
  // cannot follow a login redirect). Matches the standard error envelope
  // (`{ error: { code, message } }`) that `apiRoute` emits — see
  // lib/api/errors.ts.
  if (!isAuth && isApiRoute) {
    const err = new UnauthorizedError();
    return NextResponse.json(toErrorEnvelope(err), { status: err.status });
  }

  // Page routes: redirect unauthenticated users to login
  if (!isAuth && !isAuthRoute) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Redirect authenticated users away from the login page
  if (isAuth && isAuthRoute) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons|fonts|manifest.json).*)",
  ],
};

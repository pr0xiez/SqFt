import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isPublicReviewPath } from "@/lib/publicRoutes";

export default auth((req) => {
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
  // cannot follow a login redirect).
  if (!isAuth && isApiRoute) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

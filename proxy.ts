import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export default auth((req) => {
  if (req.nextUrl.pathname.startsWith("/api/")) {
    console.log(
      JSON.stringify({
        type: "proxy_request",
        ts: new Date().toISOString(),
        method: req.method,
        path: req.nextUrl.pathname,
        isAuthenticated: !!req.auth,
        env: process.env.NODE_ENV,
      })
    );
  }

  const isAuth = !!req.auth;
  const isAuthRoute = req.nextUrl.pathname.startsWith("/login");
  const isApiAuth = req.nextUrl.pathname.startsWith("/api/auth");
  const isPublicQuote = req.nextUrl.pathname.startsWith("/q/");

  // Allow auth API routes and public token-authed quote pages through unconditionally
  if (isApiAuth || isPublicQuote) return NextResponse.next();

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

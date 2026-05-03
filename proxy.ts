import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const isAuth = !!req.auth;
  const isAuthRoute =
    req.nextUrl.pathname.startsWith("/login") ||
    req.nextUrl.pathname.startsWith("/signup") ||
    req.nextUrl.pathname.startsWith("/onboarding");
  const isApiAuth = req.nextUrl.pathname.startsWith("/api/auth");

  // Allow auth API routes through
  if (isApiAuth) return NextResponse.next();

  // Redirect unauthenticated users to login
  if (!isAuth && !isAuthRoute) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Redirect authenticated users away from auth pages
  if (isAuth && isAuthRoute && !req.nextUrl.pathname.startsWith("/onboarding")) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons|fonts|manifest.json).*)"],
};

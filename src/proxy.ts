import { auth } from "@/auth";
import { NextResponse } from "next/server";

const PUBLIC_EXACT = ["/sign-in"];
const PUBLIC_PREFIX = ["/share/", "/api/og/"];

export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth;
  const isSignIn = nextUrl.pathname === "/sign-in";
  const isPublic =
    PUBLIC_EXACT.includes(nextUrl.pathname) ||
    PUBLIC_PREFIX.some((p) => nextUrl.pathname.startsWith(p));

  if (!isLoggedIn && !isPublic) {
    const url = new URL("/sign-in", nextUrl);
    if (nextUrl.pathname !== "/") {
      url.searchParams.set("from", nextUrl.pathname);
    }
    return NextResponse.redirect(url);
  }
  // Only bounce signed-in users away from the sign-in page itself, not from
  // other public pages like /share/[userId].
  if (isLoggedIn && isSignIn) {
    return NextResponse.redirect(new URL("/", nextUrl));
  }
});

export const config = {
  // Skip Auth.js callbacks, Next internals, static files
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};

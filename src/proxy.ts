import { auth } from "@/auth";
import { NextResponse } from "next/server";

const PUBLIC = ["/sign-in"];

export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth;
  const isPublic = PUBLIC.some((p) => nextUrl.pathname.startsWith(p));

  if (!isLoggedIn && !isPublic) {
    const url = new URL("/sign-in", nextUrl);
    if (nextUrl.pathname !== "/") {
      url.searchParams.set("from", nextUrl.pathname);
    }
    return NextResponse.redirect(url);
  }
  if (isLoggedIn && isPublic) {
    return NextResponse.redirect(new URL("/", nextUrl));
  }
});

export const config = {
  // Skip Auth.js callbacks, Next internals, static files
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};

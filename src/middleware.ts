import { type NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, safeEqual, sessionToken } from "@/lib/session";

export async function middleware(req: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next(); // no password set: open (local dev)
  const cookie = req.cookies.get(SESSION_COOKIE)?.value ?? "";
  if (cookie && safeEqual(cookie, await sessionToken(password))) return NextResponse.next();
  const login = new URL("/login", req.url);
  login.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(login);
}

export const config = {
  // The scheduler endpoint has its own secret; static assets stay public.
  matcher: ["/((?!login|api/cron|_next/static|_next/image|favicon.svg).*)"],
};

import { adminLoginHref } from "@yesvus/helmdeck";
import { NextResponse, type NextRequest } from "next/server";
import { HOST_SESSION_COOKIE } from "@/host/session-cookie";

export function proxy(request: NextRequest): NextResponse | undefined {
  if (request.method !== "GET" && request.method !== "HEAD") return undefined;
  if (request.cookies.get(HOST_SESSION_COOKIE)?.value) return undefined;

  const destination = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  return NextResponse.redirect(new URL(adminLoginHref("/login", destination), request.url));
}

export const config = {
  matcher: ["/admin/:path*"],
};

import { adminLoginHref } from "@yesvus/helmdeck";
import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_REQUEST_PATH_HEADER } from "@/host/request-path";
import { HOST_SESSION_COOKIE } from "@/host/session-cookie";

export function proxy(request: NextRequest): NextResponse | undefined {
  if (request.method !== "GET" && request.method !== "HEAD") return undefined;
  const destination = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  if (!request.cookies.get(HOST_SESSION_COOKIE)?.value) {
    return NextResponse.redirect(new URL(adminLoginHref("/login", destination), request.url));
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(ADMIN_REQUEST_PATH_HEADER, destination);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/admin/:path*"],
};

/**
 * Where the redirect for a visitor with no session is built, which is the only place that knows the
 * path they asked for.
 *
 * A layout cannot read the route it is rendering, so the guard in `app/admin/layout.tsx` can only
 * name that segment's root. This runs before the render, where the real path is on the request, and
 * carries it into the sign-in page's `next` so a visitor deep-linked to one product comes back to
 * that product.
 *
 * Presence only, deliberately. Verifying a session means checking a signature and reading a row
 * behind it, and both belong to the guard, which runs for every request that gets past here. A
 * cookie that is present is passed through whatever it holds, forged or expired, so the layout is
 * still the thing that refuses and the answer to "may this visitor have this page" has not moved one
 * layer earlier.
 */

import { adminLoginHref } from "@yesvus/helmdeck";
import { NextResponse, type NextRequest } from "next/server";
import { LOGIN_PATH, SESSION_COOKIE } from "./lib/sign-in";

export function proxy(request: NextRequest): NextResponse | undefined {
  // A server action arrives as a POST to the route that owns it, and the guard inside that action
  // refuses it with the answer it wants to give. Redirecting it from here would forward the body to
  // a sign-in page with no POST handler, turning a refusal into a 405.
  if (request.method !== "GET" && request.method !== "HEAD") return undefined;
  // An empty value is not a session either, and the layout's guard would refuse it, so treating it
  // as absent costs nothing and keeps the destination for a browser that sent one by accident.
  if (request.cookies.get(SESSION_COOKIE)?.value) return undefined;

  // `adminLoginHref` validates the destination before it becomes a link somebody follows, so a
  // crafted path lands on the package's own refusal rather than on another origin's sign-in page.
  // The query rides along, because a list's search, filters and page number are part of where it was.
  const destination = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  return NextResponse.redirect(new URL(adminLoginHref(LOGIN_PATH, destination), request.url));
}

/**
 * Only the guarded segment. `/login` is absent on purpose, and a redirect to itself is a loop
 * rather than a sign-in.
 */
export const config = {
  matcher: ["/admin/:path*"],
};

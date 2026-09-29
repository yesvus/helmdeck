// SPDX-License-Identifier: MIT

/**
 * Where the redirect for a visitor with no session is built, which is the only place that knows the
 * path they asked for.
 *
 * A layout cannot ask which route it is rendering: there is no supported way for `ShellLayout` to
 * read the requested path, so the guard it calls can only name a destination it was handed, and a
 * layout that guards a segment hands it the root of that segment. That is why `/shell/content` was
 * answering `next=/shell`: the visitor asked for a page, was sent to sign in, and came back to the
 * top of the segment instead of the page.
 *
 * This runs before the render, where the real path is on the request, and carries it into the
 * sign-in page's `next`. It is the redirect, not the guard: nothing here decides who may see what.
 *
 * Presence only, deliberately. Verifying a session means checking a signature and then reading a row
 * behind it, and both belong to the guard in the layout, which runs for every request that gets past
 * here. A cookie that is present is passed through whatever it holds, forged or expired, so the
 * layout's verification is still the thing that refuses and the answer to "may this visitor have
 * this page" has not moved one layer earlier.
 */

import { adminLoginHref } from "@yesvus/helmdeck";
import { NextResponse, type NextRequest } from "next/server";
import { LOGIN_PATH, SESSION_COOKIE } from "./lib/demo-sign-in";

export function proxy(request: NextRequest): NextResponse | undefined {
  // A server action arrives as a POST to the route that owns it, and the guard inside that action
  // refuses it with the answer it wants to give. Redirecting it from here would forward the POST
  // body to a sign-in page that has no POST handler, which turns a refusal into a 405.
  if (request.method !== "GET" && request.method !== "HEAD") return undefined;
  // An empty value is not a session either, and the layout's guard would refuse it, so treating it
  // as absent costs nothing and keeps the destination for a browser that sent one by accident.
  if (request.cookies.get(SESSION_COOKIE)?.value) return undefined;

  // `adminLoginHref` validates the destination before it becomes a link a visitor follows, so a
  // crafted path lands on the package's own refusal rather than on a cross-origin sign-in page. The
  // query rides along because a list page's filters and page number are part of where they were.
  const destination = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  return NextResponse.redirect(new URL(adminLoginHref(LOGIN_PATH, destination), request.url));
}

/**
 * The two segments whose guard lives in a layout, which are the two that cannot name their own
 * destination. `/login` is deliberately absent: a redirect to itself is a loop rather than a sign-in.
 */
export const config = {
  matcher: ["/shell/:path*", "/dashboard/:path*"],
};

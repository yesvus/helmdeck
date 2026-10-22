import { redirect } from "next/navigation";
import { SignInForm } from "@/components/sign-in-form";
import { currentAdminSession } from "@/lib/session";

/**
 * The sign-in route: the form, for a visitor with no session.
 *
 * The session is resolved on the server, so the page a visitor receives already says which of the
 * two it is. A signed-in visitor is sent to the admin rather than shown a form that would work.
 *
 * This is also the page Payload's panel sends a signed-out visitor to, because the panel's own
 * login route is pointed here. One form, one place where a password is typed.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  // Rebuilt into one string rather than handed over as the object, because the action validates
  // what it is given and an unvalidated query string is what a crafted `next` arrives in.
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") query.set(key, value);
  }

  // Payload's panel sends the page it was heading for as `redirect`, and the package's own
  // destination reader looks for `next`. Mapping one onto the other keeps a deep link into the
  // panel a deep link out of it, and the value is validated either way.
  if (!query.has("next") && query.has("redirect")) {
    query.set("next", query.get("redirect") ?? "");
  }

  if (await currentAdminSession()) redirect("/admin");

  return <SignInForm search={query.toString()} />;
}

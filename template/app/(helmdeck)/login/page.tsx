import { redirect } from "next/navigation";
import { SignInForm } from "@/components/sign-in-form";
import { currentAdminSession } from "@/lib/session";

/**
 * The sign-in route: the form, for a visitor with no session.
 *
 * The session is resolved on the server, so the page a visitor receives already says which of the
 * two it is. A signed-in visitor is sent to the admin rather than shown a form that would work.
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

  if (await currentAdminSession()) redirect("/admin");

  return <SignInForm search={query.toString()} />;
}

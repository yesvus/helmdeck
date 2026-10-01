// SPDX-License-Identifier: MIT

/**
 * The demo's login route: a form when there is no session, the session itself when there is.
 *
 * The session is resolved on the server, so the page a visitor receives already says which of the
 * two it is rather than showing a form and finding out afterwards. The accounts and the password
 * are handed down as props for the same reason the session is: a browser is handed what it needs
 * to render, and nothing that reads a file or a database.
 */

import { DEMO_PASSWORD, demoAccounts } from "../../../lib/demo-accounts";
import { currentDemoSession } from "../../../lib/demo-session";
import { LOGIN_PATH } from "../../../lib/demo-guard";
import { LoginForm } from "./login-form";
import { SessionCard } from "./session-card";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") query.set(key, value);
  }

  const session = await currentDemoSession();
  if (session) return <SessionCard session={session} loginPath={LOGIN_PATH} />;

  const ended = Number(query.get("ended"));
  return (
    <LoginForm
      search={query.toString()}
      accounts={demoAccounts}
      password={DEMO_PASSWORD}
      ended={Number.isInteger(ended) && ended > 0 ? ended : null}
    />
  );
}

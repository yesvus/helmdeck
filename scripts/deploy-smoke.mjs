// SPDX-License-Identifier: MIT

/**
 * A smoke check for a deployed demo, built around the request that actually reaches the database.
 *
 * The failure this exists for took the public demo offline for hours and every HTTP check that ran
 * during it returned 200, because the routes being checked short-circuited before the persistence
 * layer was ever touched. A request with no session cookie is answered by the cookie parser alone,
 * so `GET /login -> 200` proves the page renders and nothing more. Only the sign-in reaches the
 * store: it is the one request that reads a user row, and the one that runs the seed and the
 * migration runner before it does. So the check signs in, and treats every other probe as the cheap
 * thing it is.
 *
 * `node scripts/deploy-smoke.mjs <url>`, no dependency beyond Node's own fetch, and nothing is
 * written to the deployment's database beyond the session row a visitor's own sign-in would create.
 *
 * Every function here takes its fetch as an argument, so the tests drive the whole check against an
 * injected one and never touch the network. A test of this file proves nothing about a deployment;
 * only a run against a URL does that.
 */

import { argv as processArgv, exit as processExit, stderr, stdout } from "node:process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const LOGIN_PATH = "/login";
const SESSION_COOKIE = "helmdeck_session";
const GUARDED_PATH = "/shell/products";
const PUBLIC_PATH = "/";
const DEFAULT_AFTER_LOGIN = "/dashboard";
const DEFAULT_TIMEOUT_MS = 30_000;

/** The demo's published accounts. The login page prints these, so a change to either is a real change. */
export const DEFAULT_CREDENTIALS = Object.freeze({
  email: "owner@demo.helmdeck.dev",
  password: "helmdeck-demo",
});

/**
 * A session cookie with the shape of a real one and a signature that is not.
 *
 * Shaped like `<id>.<hmac>` on purpose: a value with no separator is refused by the seal before any
 * comparison runs, so it exercises less of the reader than a real cookie would. This one reaches the
 * signature comparison, which is as far as a request without the signing secret can get.
 */
export const JUNK_SESSION_COOKIE = `not-a-real-session-id.${"0".repeat(64)}`;

/** The path the deployment under test is asked about, normalized to have no trailing slash. */
export function normalizeBase(input) {
  const trimmed = String(input ?? "").trim();
  if (!trimmed) throw new Error("A URL is required: node scripts/deploy-smoke.mjs <url>");
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`"${trimmed}" is not a URL. Pass one like https://example.com`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`"${trimmed}" is not an http or https URL.`);
  }
  return `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}`;
}

/** One request, with the parts of the response the checks read and nothing else kept. */
async function request(fetchImpl, url, { method = "GET", headers = {}, body, timeoutMs }) {
  const response = await fetchImpl(url, {
    method,
    headers,
    body,
    redirect: "manual",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text().catch(() => "");
  return {
    status: response.status,
    location: response.headers.get("location"),
    contentType: response.headers.get("content-type"),
    setCookie: readSetCookie(response.headers),
    body: text,
  };
}

function readSetCookie(headers) {
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  const single = headers.get("set-cookie");
  return single ? [single] : [];
}

/** The cookies a response issued, as the `Cookie` header value a later request would send. */
export function toCookieHeader(setCookie) {
  return setCookie
    .map((entry) => entry.split(";")[0]?.trim())
    .filter((pair) => pair && pair.includes("="))
    .join("; ");
}

/** The action ids a client bundle names, with the export each is bound to. */
export function findServerActions(js) {
  const named = [
    ...js.matchAll(/createServerReference\)\(\s*"([0-9a-f]{30,})"\s*,[\s\S]{0,160}?,\s*"([A-Za-z_$][\w$]*)"/g),
  ].map((match) => ({ id: match[1], name: match[2] }));
  const seen = new Set(named.map((action) => action.id));
  const anonymous = [...js.matchAll(/createServerReference\)\(\s*"([0-9a-f]{30,})"/g)]
    .map((match) => ({ id: match[1], name: null }))
    .filter((action) => !seen.has(action.id));
  return [...named, ...anonymous];
}

/**
 * The chunk paths a rendered page points at, from its flight payload and its script tags.
 *
 * The flight payload is where a client component reference carries the chunk holding it, and the
 * script tags are the fallback for a build that inlines nothing.
 */
export function findChunkPaths(html) {
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
    .map((match) => match[1])
    .filter((source) => source.includes("__next_f"))
    .join("\n");
  const fromFlight = [...inline.matchAll(/I\[\d+,\[((?:"[^"]*",?)+)\],"[^"]*"/g)].flatMap((match) =>
    [...match[1].matchAll(/"([^"]+\.js)"/g)].map((path) => path[1]),
  );
  const fromTags = [...html.matchAll(/<script[^>]*\bsrc="([^"]+\.js)"/g)].map((match) => match[1]);
  return [...new Set([...fromFlight, ...fromTags])];
}

/** The action id for a named sign-in action, or null with the reason it could not be found. */
export async function discoverSignInAction(fetchImpl, base, { name, timeoutMs }) {
  const page = await request(fetchImpl, `${base}${LOGIN_PATH}`, { timeoutMs });
  const bundles = await Promise.all(
    findChunkPaths(page.body).map((path) =>
      request(fetchImpl, new URL(path, base).href, { timeoutMs }),
    ),
  );
  const candidates = bundles.flatMap((bundle) => findServerActions(bundle.body));
  const named = candidates.find((action) => action.name === name);
  if (named) return { id: named.id, source: "named", candidates };
  if (candidates.length === 1) return { id: candidates[0].id, source: "only", candidates };
  return {
    id: null,
    source: "missing",
    candidates,
    reason:
      candidates.length === 0
        ? `no chunk of ${LOGIN_PATH} named a server action, so the sign-in action id is unknown`
        : `${candidates.length} server actions were found and none is named ${name}`,
  };
}

/** A flight payload row that carries an error rather than a value. */
export function flightErrorRow(body) {
  const row = /^\s*(\d+):E(\{[\s\S]*)$/m.exec(body);
  if (!row) return null;
  const digest = /"digest"\s*:\s*"([^"]*)"/.exec(row[2]);
  return { row: row[1], digest: digest ? digest[1] : null };
}

function result(name, ok, detail) {
  return { name, ok, detail };
}

/** The sign-in page: the fields a form needs, and a submit a visitor can press. */
async function checkLoginPage(fetchImpl, base, { timeoutMs }) {
  const page = await request(fetchImpl, `${base}${LOGIN_PATH}`, { timeoutMs });
  const missing = [
    [/<input[^>]*type="email"/i, "an email field"],
    [/<input[^>]*type="password"/i, "a password field"],
    [/<button[^>]*type="submit"/i, "a submit button"],
  ]
    .filter(([pattern]) => !pattern.test(page.body))
    .map(([, label]) => label);
  const ok = page.status === 200 && missing.length === 0;
  return {
    ...result(`sign-in page ${LOGIN_PATH} renders a form`, ok, ok ? "200, with email, password and submit" : describe(page, missing)),
    page,
  };
}

/**
 * The sign-in page for a visitor already carrying a session cookie.
 *
 * The point of sending the cookie is to reach the part of the request that reads it. Without one, the
 * reader is asked for a value and returns nothing, so the credential path is never entered and the
 * page renders from static data alone: a check that drops this cookie still passes against the exact
 * outage this was written for, which is why the cookie is built by hand and asserted on rather than
 * left to a cookie jar.
 *
 * What it does not reach is the store, and the output says so. A signature this check cannot produce
 * is refused before any row is read, so this proves the cookie was parsed and the reader answered, and
 * the sign-in is the probe that proves the store. See the failure vocabulary in the README.
 */
async function checkJunkCookieLogin(fetchImpl, base, { timeoutMs }) {
  const page = await request(fetchImpl, `${base}${LOGIN_PATH}`, {
    headers: { cookie: `${SESSION_COOKIE}=${JUNK_SESSION_COOKIE}` },
    timeoutMs,
  });
  const normal = page.status === 200 && !flightErrorRow(page.body);
  return result(
    `${LOGIN_PATH} with a junk session cookie answers normally`,
    normal,
    normal
      ? "200, so the cookie was read and refused without throwing"
      : describe(page, []),
  );
}

/** An authenticated route with a junk cookie: the guard has to read the session to refuse it. */
async function checkGuardedRedirect(fetchImpl, base, { timeoutMs }) {
  const page = await request(fetchImpl, `${base}${GUARDED_PATH}`, {
    headers: { cookie: `${SESSION_COOKIE}=${JUNK_SESSION_COOKIE}` },
    timeoutMs,
  });
  const location = page.location ? new URL(page.location, base) : null;
  const isRedirect = page.status >= 300 && page.status < 400;
  const pointsAtLogin = location?.pathname === LOGIN_PATH;
  const next = location?.searchParams.get("next") ?? null;
  const ok = isRedirect && pointsAtLogin && Boolean(next);
  return {
    ...result(
      `${GUARDED_PATH} with a junk cookie redirects to ${LOGIN_PATH} and names the destination`,
      ok,
      ok
        ? `${page.status} to ${location.pathname}${location.search} (next=${next})`
        : `${page.status} with location ${page.location ?? "none"}; a refusal must be a redirect to ${LOGIN_PATH} carrying a next parameter`,
    ),
    next,
  };
}

/** A route a visitor reaches with no session at all, so a broken build cannot hide behind the guard. */
async function checkPublicRoute(fetchImpl, base, { path, timeoutMs }) {
  const page = await request(fetchImpl, `${base}${path}`, { timeoutMs });
  const ok = page.status === 200 && page.body.length > 0;
  return result(
    `public route ${path} renders`,
    ok,
    ok ? `200, ${page.body.length} bytes` : describe(page, []),
  );
}

/**
 * A real sign-in, driven over HTTP.
 *
 * This is the check the outage needed and the four above could not be. The action id is read out of
 * the build the deployment is serving rather than configured, because it is a per-build hash and a
 * hardcoded one fails on the next deploy, which would train whoever reads the output to ignore it.
 *
 * Success is judged on the session cookie the action issues and not on the shape of its body: the
 * cookie is written only after the user row has been read, so its presence is the assertion, and a
 * body format this check guesses at is a way to fail a working deployment.
 */
async function checkSignIn(fetchImpl, base, { credentials, actionName, timeoutMs }) {
  const discovery = await discoverSignInAction(fetchImpl, base, { name: actionName, timeoutMs });
  if (!discovery.id) {
    return {
      ...result("a real sign-in reaches the store", false, `could not be driven: ${discovery.reason}. The store was not exercised at all, and that is a failure of this check rather than a pass.`),
      discovered: false,
    };
  }

  const response = await request(fetchImpl, `${base}${LOGIN_PATH}`, {
    method: "POST",
    headers: { "Next-Action": discovery.id, "Content-Type": "text/plain;charset=UTF-8" },
    body: JSON.stringify([{ email: credentials.email, password: credentials.password }, ""]),
    timeoutMs,
  });

  const flightError = flightErrorRow(response.body);
  const cookieHeader = toCookieHeader(response.setCookie);
  const refused = /"ok":false/.test(response.body);

  if (response.status >= 300 && response.status < 400) {
    return {
      ...result(
        "a real sign-in reaches the store",
        false,
        `the action was redirected (${response.status} to ${response.location}), so the POST never reached the action. A route guard is answering a server action with a sign-in page.`,
      ),
      discovered: true,
    };
  }
  if (flightError || response.status !== 200) {
    return {
      ...result(
        "a real sign-in reaches the store",
        false,
        `the action threw: HTTP ${response.status}${flightError?.digest ? `, flight error digest ${flightError.digest}` : ""}. The action is where the seed and the migration runner run, so this is a failure in the persistence or credential path and the message is in the deployment log, not in this response.`,
      ),
      discovered: true,
      threw: true,
    };
  }
  if (!cookieHeader) {
    return {
      ...result(
        "a real sign-in reaches the store",
        false,
        refused
          ? `the action answered "ok": false, so it read the store and refused ${credentials.email}. Either the accounts are not seeded or the password published on the login page no longer matches. The response body names which.`
          : `the action answered ${response.status} with no session cookie and no "ok": false, so the answer is one this check does not recognise. The body is the evidence: ${clip(response.body)}`,
      ),
      discovered: true,
      refused: true,
    };
  }

  return {
    ...result(
      "a real sign-in reaches the store",
      true,
      `signed in as ${credentials.email}, and the action issued a session cookie`,
    ),
    discovered: true,
    cookieHeader,
  };
}

/** The page a signed-in visitor lands on, over the cookie the sign-in just issued. */
async function checkAuthenticatedPage(fetchImpl, base, { cookieHeader, path, timeoutMs }) {
  const page = await request(fetchImpl, `${base}${path}`, {
    headers: { cookie: cookieHeader },
    timeoutMs,
  });
  const redirected = page.status >= 300 && page.status < 400;
  const isLoginPage = /<input[^>]*type="password"/i.test(page.body);
  const ok = page.status === 200 && !redirected && !isLoginPage;
  return {
    ...result(
      `${path} renders for the session the sign-in issued`,
      ok,
      ok
        ? `200, ${page.body.length} bytes, and it is not the sign-in page`
        : redirected
          ? `${page.status} to ${page.location}, so a session that was just issued is not honoured on the next request. Writing the session and reading it disagree.`
          : `HTTP ${page.status} and the body ${isLoginPage ? "is the sign-in form" : "is not the page"}, so the session did not reach the page it guards.`,
    ),
  };
}

function describe(page, missing) {
  const parts = [`HTTP ${page.status}`];
  if (page.location) parts.push(`location ${page.location}`);
  if (missing.length > 0) parts.push(`missing ${missing.join(", ")}`);
  return parts.join(", ");
}

function clip(text, limit = 200) {
  const flat = String(text ?? "").replace(/\s+/g, " ").trim();
  return flat.length > limit ? `${flat.slice(0, limit)}...` : flat;
}

/**
 * What the results support, which is less than what they appear to support.
 *
 * The point of this is that a check which reads as comprehensive is how the next outage also goes
 * unnoticed. Every line here is something the results do not establish.
 */
export function whatThisCannotConclude() {
  return [
    "A wrong password, a wrong role, or a permission that is too generous. The sign-in proves the",
    "  store answers for one published account; it says nothing about any other account's role.",
    "A slow query. Every request here has a timeout and a timeout that fires is reported as a",
    "  failure, but a page that renders in 4.9s is reported as healthy.",
    "A bad visual, a broken stylesheet, or a page that renders the wrong content. The checks read",
    "  status codes and a handful of markers, so a regression in layout is invisible to them.",
    "An analytics number that is wrong. Nothing here reads what a page displays, only that it was",
    "  served and that the store behind it answered.",
    "A store that is configured at all. A deployment that fell back to its in-memory store would",
    "  pass every check here, because that store answers exactly like a database until the next",
    "  restart. Nothing in the responses says which one answered.",
    "Anything at all when the action id cannot be discovered. That case is a failure, not a skip:",
    "  a check that quietly stops testing is worse than one that is absent.",
  ];
}

/** The next thing a human should do, which is reading the log where the message actually is. */
export function logCommand(base, minutes = 5) {
  return `vercel logs ${base} --since ${minutes}m`;
}

/**
 * The diagnosis, from the combination of results rather than from any one of them.
 *
 * The useful sentence is the one that rules the obvious explanation out, so each branch names what
 * has been ruled out as well as what has not.
 */
export function diagnose(results, base) {
  const by = (name) => results.find((entry) => entry.name.startsWith(name));
  const failed = results.filter((entry) => !entry.ok);
  if (failed.length === 0) {
    return [
      `Every check passed against ${base}.`,
      "The sign-in issued a session and the session rendered a page, so the persistence path, the",
      "credential path and the session guard all answered on this deploy.",
    ];
  }

  const lines = [`${failed.length} of ${results.length} checks failed against ${base}.`];
  const signIn = by("a real sign-in");
  const authed = by("renders for the session");
  const junk = by("with a junk session cookie");
  const guarded = by("with a junk cookie redirects");

  if (signIn && !signIn.ok) {
    if (!signIn.discovered) {
      lines.push(
        "The sign-in could not be driven, so the store was never reached by this run. The four",
        "cheaper checks are not a substitute: they read the cookie and the redirect, not the store.",
      );
    } else if (signIn.threw) {
      lines.push(
        "The sign-in action threw, and the action is the only request here that reads a user row,",
        "runs the seed and runs the migration runner before it does. A landing page, a form and a",
        "redirect all still pass on a deployment in this state, which is the failure this check",
        "exists for. The exception is in the deployment log and the response body carries only a",
        "digest, so read the log:",
        `  ${logCommand(base)}`,
      );
    } else {
      lines.push(
        "The sign-in action answered and did not throw, so the deployment reached its own code and",
        "the store answered it with a refusal rather than an error. The refusal is about the account",
        "or the password, not about the schema.",
      );
    }
  }

  if (authed && !authed.ok && signIn?.ok) {
    lines.push(
      "The sign-in succeeded and the session it issued was not honoured on the next request, so",
      "writing a session and reading it disagree. That is a narrower failure than a dead store and",
      "it is not what a 500 anywhere would have shown you.",
    );
  }

  if (junk && !junk.ok && signIn?.ok) {
    lines.push(
      "The sign-in worked, so the store and the credentials are fine, and the failure is in reading a",
      "refused cookie. The guard's own answer is missing rather than wrong.",
    );
  }

  if (guarded && !guarded.ok && signIn?.ok) {
    lines.push(
      "A real session works and the guard did not redirect a junk cookie, so the guard is answering",
      "from something other than the session it resolved.",
    );
  }

  if (signIn?.ok && authed?.ok) {
    lines.push(
      "The store answered for a real sign-in and for the page behind it, so the failure is in the",
      "pages or the routes rather than in persistence. A status code this run could not expect is",
      "the shape of that: a route that moved, a proxy that answers differently, or a page that 500s",
      "on its own.",
    );
  }

  lines.push(
    "",
    "What this run does not establish:",
    ...whatThisCannotConclude().map((line) => `  ${line}`),
  );
  return lines;
}

/**
 * Runs every check against a URL.
 *
 * `fetchImpl` is a parameter so the tests drive the whole thing without a network. A real run needs
 * a URL; there is no offline mode, because an offline pass would be a claim about nothing.
 */
export async function runSmoke({
  base,
  fetchImpl = fetch,
  credentials = DEFAULT_CREDENTIALS,
  actionName = "signInAction",
  guardedPath = GUARDED_PATH,
  publicPath = PUBLIC_PATH,
  afterLoginPath = DEFAULT_AFTER_LOGIN,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const target = normalizeBase(base);
  const options = { credentials, actionName, timeoutMs };

  const loginPage = await checkLoginPage(fetchImpl, target, options);
  const junk = await checkJunkCookieLogin(fetchImpl, target, options);
  const guarded = await checkGuardedRedirect(fetchImpl, target, options);
  const publicRoute = await checkPublicRoute(fetchImpl, target, { path: publicPath, timeoutMs });
  const signIn = await checkSignIn(fetchImpl, target, options);
  const authenticated = signIn.ok
    ? await checkAuthenticatedPage(fetchImpl, target, {
        cookieHeader: signIn.cookieHeader,
        path: afterLoginPath,
        timeoutMs,
      })
    : {
        ...result(
          `${afterLoginPath} renders for the session the sign-in issued`,
          false,
          "not attempted, because the sign-in issued no session to send",
        ),
      };

  return {
    base: target,
    results: [loginPage, junk, guarded, publicRoute, signIn, authenticated],
  };
}

function parseArgs(argv) {
  const flags = new Map();
  const positional = [];
  for (const arg of argv) {
    if (arg.startsWith("--")) {
      const [name, ...rest] = arg.slice(2).split("=");
      flags.set(name, rest.join("=") || "true");
    } else {
      positional.push(arg);
    }
  }
  return { flags, positional };
}

function report(run, { write = (line) => stdout.write(`${line}\n`) } = {}) {
  const failed = run.results.filter((entry) => !entry.ok);
  write(`deploy smoke: ${run.base}`);
  write("");
  for (const entry of run.results) {
    write(`  ${entry.ok ? "pass" : "FAIL"}  ${entry.name}`);
    write(`        ${entry.detail}`);
  }
  write("");
  for (const line of diagnose(run.results, run.base)) {
    write(line);
  }
  if (failed.length > 0) {
    write("");
    write(`vercel logs: ${logCommand(run.base)}`);
  }
  return failed.length > 0 ? 1 : 0;
}

async function main(argv) {
  const { flags, positional } = parseArgs(argv);
  if (flags.has("help") || positional.length === 0) {
    stdout.write(
      [
        "usage: node scripts/deploy-smoke.mjs <url> [--email=] [--password=] [--timeout=ms]",
        "",
        "  Exercises a deployed demo and exits non-zero with a diagnosis when something is wrong.",
        "  The sign-in is the check that matters: it is the only request that reads a user row.",
        "  The demo's published account is used unless --email and --password say otherwise.",
        "",
      ].join("\n"),
    );
    return 0;
  }

  const run = await runSmoke({
    base: positional[0],
    credentials: {
      email: flags.get("email") ?? DEFAULT_CREDENTIALS.email,
      password: flags.get("password") ?? DEFAULT_CREDENTIALS.password,
    },
    timeoutMs: Number(flags.get("timeout") ?? DEFAULT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
  });
  return report(run);
}

const invokedDirectly =
  processArgv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(processArgv[1]);
if (invokedDirectly) {
  main(processArgv.slice(2)).then(
    (code) => processExit(code),
    (cause) => {
      stderr.write(`deploy smoke could not run: ${cause?.message ?? cause}\n`);
      processExit(2);
    },
  );
}

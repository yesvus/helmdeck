// SPDX-License-Identifier: MIT

/**
 * The check's logic, against an injected fetch.
 *
 * Nothing here touches the network. A test of this file proves that the check recognises each
 * failure and says something true about it. It proves nothing about a deployment: only
 * `node scripts/deploy-smoke.mjs <url>` does that, and the failure it exists for is a server-side
 * one that no local test can stage.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_CREDENTIALS,
  JUNK_SESSION_COOKIE,
  diagnose,
  findChunkPaths,
  findServerActions,
  flightErrorRow,
  normalizeBase,
  report,
  runSmoke,
  toCookieHeader,
} from "./deploy-smoke.mjs";

const BASE = "https://demo.example";

const LOGIN_HTML = [
  '<input type="email" name="email"/>',
  '<input type="password" name="password"/>',
  '<button type="submit">Sign in</button>',
  '<script>self.__next_f=self.__next_f||[]).push([1,"',
  '3007:I[3007,["/_next/static/immutable/chunks/login.js"],"LoginForm"]',
  '"])</script>',
  '<script src="/_next/static/immutable/chunks/next.js"></script>',
].join("");

const LOGIN_CHUNK =
  'let i=(0,s.createServerReference)("609cf0fdc5b04861d2c8a1f4a79771a4d416066849",' +
  's.callServer,void 0,s.findSourceMapURL,"signInAction");' +
  'e.s(["LoginForm",0,function(){}]);';

const SIGN_IN_OK_BODY = '0:{"a":"$@1","f":"","i":false}\n1:{"ok":true,"next":"/dashboard"}\n';
const SESSION_COOKIE = "helmdeck_session=sess_abc.def456; Path=/; HttpOnly; SameSite=Lax; Secure";

/**
 * A deployment, faked.
 *
 * `storeBroken` is the failure this check was written for, and it is deliberately narrow: the sign-in
 * action throws while the landing page, the form, the cookie-bearing page and the guard's redirect all
 * answer exactly as they do on a healthy deployment. That is what the outage looked like from outside,
 * and a fake that darkened every route would be satisfied by an implementation that never reached the
 * store at all.
 */
function fakeDeployment({
  storeBroken = false,
  discovery = true,
  refuseSignIn = false,
  redirectSignIn = false,
  darkCookieReads = false,
  loginHtml = LOGIN_HTML,
  honourSession = true,
  guardRedirect = "/login?next=%2Fshell",
} = {}) {
  const calls = [];

  function reply(body, { status = 200, location, setCookie, contentType = "text/html" } = {}) {
    const headers = new Headers();
    if (location) headers.set("location", location);
    if (setCookie) headers.append("set-cookie", setCookie);
    if (contentType) headers.set("content-type", contentType);
    return new Response(body, { status, headers });
  }

  async function fetchImpl(input, init = {}) {
    const url = new URL(String(input));
    const method = init.method ?? "GET";
    const headers = new Headers(init.headers);
    const cookie = headers.get("cookie") ?? "";
    calls.push({ method, path: url.pathname, cookie, action: headers.get("next-action") });

    if (url.pathname === "/_next/static/immutable/chunks/login.js") {
      return reply(discovery ? LOGIN_CHUNK : "/* no actions here */", {
        contentType: "text/javascript",
      });
    }
    if (url.pathname === "/_next/static/immutable/chunks/next.js") {
      return reply("", { contentType: "text/javascript" });
    }
    if (url.pathname === "/login" && method === "POST") {
      if (!headers.get("next-action")) return reply("", { status: 400 });
      if (redirectSignIn) return reply("", { status: 307, location: "/login" });
      if (storeBroken) {
        return reply('0:{"a":"$@1","f":"","i":false}\n1:E{"digest":"3779942419"}\n', {
          status: 500,
          contentType: "text/x-component",
        });
      }
      if (refuseSignIn) {
        return reply('0:{"a":"$@1","f":"","i":false}\n1:{"ok":false,"message":"no match"}\n', {
          contentType: "text/x-component",
        });
      }
      return reply(SIGN_IN_OK_BODY, { setCookie: SESSION_COOKIE, contentType: "text/x-component" });
    }
    if (url.pathname === "/login") {
      // A page that renders for a visitor carrying a cookie and short-circuits for one that is not,
      // which is the shape that let the outage pass every HTTP check.
      if (cookie.includes(JUNK_SESSION_COOKIE) && darkCookieReads) return reply("", { status: 500 });
      return reply(loginHtml);
    }
    if (url.pathname === "/shell/products") {
      if (!guardRedirect) return reply("<main>Products</main>");
      return reply("", { status: 307, location: guardRedirect });
    }
    if (url.pathname === "/dashboard") {
      if (!honourSession || !cookie.includes("helmdeck_session=sess_abc.def456")) {
        return reply("", { status: 307, location: "/login?next=%2Fdashboard" });
      }
      return reply("<main>Engine dashboard</main>");
    }
    if (url.pathname === "/") return reply("<main>Helmdeck</main>");
    return reply("", { status: 404 });
  }

  return { fetchImpl, calls };
}

const run = (options = {}) => runSmoke({ base: BASE, timeoutMs: 5_000, ...options });

const failed = (run_) => run_.results.filter((entry) => !entry.ok).map((entry) => entry.name);

test("a healthy deployment passes every check", async () => {
  const { fetchImpl } = fakeDeployment();
  const outcome = await run({ fetchImpl });

  assert.deepEqual(failed(outcome), [], JSON.stringify(outcome.results, null, 2));
  assert.equal(report(outcome, { write: () => {} }), 0);
});

test("the outage this check exists for is caught, while the four cheap checks still pass", async () => {
  const before = await run({ fetchImpl: fakeDeployment().fetchImpl });
  const after = await run({ fetchImpl: fakeDeployment({ storeBroken: true }).fetchImpl });

  assert.deepEqual(failed(before), []);
  assert.deepEqual(failed(after), [
    "a real sign-in reaches the store",
    "/dashboard renders for the session the sign-in issued",
  ]);
  const cheap = (outcome) =>
    outcome.results
      .filter((entry) => !entry.name.includes("real sign-in"))
      .filter((entry) => !entry.name.includes("the session the sign-in issued"))
      .map((entry) => entry.ok);
  assert.deepEqual(
    cheap(after),
    [true, true, true, true],
    "the cheap checks are meant to be blind to this failure; a change here is a change in the model",
  );
  assert.match(after.results.at(-1).detail, /not attempted, because the sign-in issued no session/);
  assert.equal(report(after, { write: () => {} }), 1);
});

test("the junk cookie is really sent, so a failure only a cookie-bearing request sees is still found", async () => {
  const { fetchImpl, calls } = fakeDeployment({ darkCookieReads: true });
  const outcome = await run({ fetchImpl });

  const junkCall = calls.find(
    (call) => call.path === "/login" && call.cookie.includes(JUNK_SESSION_COOKIE),
  );
  assert.ok(junkCall, "the sign-in page was never asked with a session cookie");
  assert.ok(junkCall.cookie.startsWith("helmdeck_session="));
  assert.ok(
    failed(outcome).includes("/login with a junk session cookie answers normally"),
    "the check passed a deployment whose cookie-bearing request was broken",
  );
});

test("the junk cookie is shaped so the signature comparison runs rather than the shape being refused", () => {
  assert.ok(JUNK_SESSION_COOKIE.includes("."), "a cookie with no separator is refused before any comparison");
  assert.match(JUNK_SESSION_COOKIE, /^[^.]+\.[0-9a-f]+$/);
});

test("a sign-in that throws is reported as the persistence path and names the log", async () => {
  const outcome = await run({ fetchImpl: fakeDeployment({ storeBroken: true }).fetchImpl });
  const signIn = outcome.results.find((entry) => entry.name.startsWith("a real sign-in"));

  assert.match(signIn.detail, /HTTP 500/);
  assert.match(signIn.detail, /3779942419/);
  const said = diagnose(outcome.results, outcome.base).join("\n");
  assert.match(said, /vercel logs https:\/\/demo\.example --since 5m/);
  assert.match(said, /only request here that reads a user row/);
});

test("a sign-in the store refuses is not reported as a broken deployment", async () => {
  const outcome = await run({ fetchImpl: fakeDeployment({ refuseSignIn: true }).fetchImpl });
  const signIn = outcome.results.find((entry) => entry.name.startsWith("a real sign-in"));

  assert.equal(signIn.ok, false);
  assert.match(signIn.detail, /"ok": false/);
  assert.match(signIn.detail, /[Ee]ither the accounts are not seeded or the password/);
  const said = diagnose(outcome.results, outcome.base).join("\n");
  assert.doesNotMatch(said, /the action threw/);
  assert.match(said, /refusal rather than an error/);
});

test("a sign-in action answered with a redirect is reported as a guard in the way", async () => {
  const outcome = await run({ fetchImpl: fakeDeployment({ redirectSignIn: true }).fetchImpl });
  const signIn = outcome.results.find((entry) => entry.name.startsWith("a real sign-in"));

  assert.match(signIn.detail, /redirected \(307 to \/login\)/);
  assert.match(signIn.detail, /never reached the action/);
});

test("an undiscoverable action id fails rather than skipping the store", async () => {
  const { fetchImpl, calls } = fakeDeployment({ discovery: false });
  const outcome = await run({ fetchImpl });
  const signIn = outcome.results.find((entry) => entry.name.startsWith("a real sign-in"));

  assert.equal(signIn.ok, false);
  assert.equal(signIn.discovered, false);
  assert.match(signIn.detail, /could not be driven/);
  assert.ok(
    !calls.some((call) => call.method === "POST"),
    "no sign-in was attempted, so nothing reached the store",
  );
  assert.match(diagnose(outcome.results, outcome.base).join("\n"), /the store was never reached/);
  assert.equal(report(outcome, { write: () => {} }), 1);
});

test("a session that is issued and then not honoured is a distinct failure from a dead store", async () => {
  const outcome = await run({ fetchImpl: fakeDeployment({ honourSession: false }).fetchImpl });
  const said = diagnose(outcome.results, outcome.base).join("\n");

  assert.deepEqual(failed(outcome), ["/dashboard renders for the session the sign-in issued"]);
  assert.match(said, /writing a session and reading it disagree/);
  assert.doesNotMatch(said, /the action threw/);
});

test("a guard that does not redirect a refused cookie is reported, not passed", async () => {
  const outcome = await run({ fetchImpl: fakeDeployment({ guardRedirect: null }).fetchImpl });
  const said = diagnose(outcome.results, outcome.base).join("\n");

  assert.ok(
    failed(outcome).some((name) => name.includes("redirects to /login and names the destination")),
  );
  assert.match(said, /the guard is answering/);
  assert.doesNotMatch(
    said,
    /rather than in persistence/,
    "the generic branch must not dilute the specific one",
  );
});

test("the diagnosis states what the run does not establish, and the store fallback is named", async () => {
  const said = diagnose([], BASE).join("\n");
  assert.match(said, /Every check passed/);
  for (const claim of ["wrong role", "slow query", "bad visual", "analytics number", "in-memory store"]) {
    assert.match(said, new RegExp(claim), `the failure vocabulary omits: ${claim}`);
  }
});

test("a public route that does not render is reported rather than passed", async () => {
  const outcome = await run({ fetchImpl: fakeDeployment().fetchImpl, publicPath: "/nope" });
  assert.deepEqual(failed(outcome), ["public route /nope renders"]);
});

test("a login form missing its password field is reported", async () => {
  const loginHtml = LOGIN_HTML.replace('<input type="password" name="password"/>', "");
  const outcome = await run({ fetchImpl: fakeDeployment({ loginHtml }).fetchImpl });

  assert.ok(failed(outcome).includes("sign-in page /login renders a form"));
  assert.match(outcome.results[0].detail, /missing a password field/);
});

test("the check sends the configured credentials and the discovered action id", async () => {
  const { fetchImpl, calls } = fakeDeployment();
  await run({ fetchImpl, credentials: { email: "editor@demo.helmdeck.dev", password: "other" } });
  const post = calls.find((call) => call.method === "POST");

  assert.equal(post.action, "609cf0fdc5b04861d2c8a1f4a79771a4d416066849");
  assert.equal(post.path, "/login");
});

test("the default credentials are the demo's published account", () => {
  assert.equal(DEFAULT_CREDENTIALS.email, "owner@demo.helmdeck.dev");
  assert.ok(DEFAULT_CREDENTIALS.password.length > 0);
});

test("the server action is found by its export name, not by position", () => {
  const bundle = [
    'x=(0,a.createServerReference)("00e500165cd8faed8172255465839a92526bf32b36",a.callServer,void 0,a.findSourceMapURL,"endEverySessionAction")',
    'y=(0,a.createServerReference)("003bbcfc7af6eb6fa344619c449cbc9e02f93ff511",a.callServer,void 0,a.findSourceMapURL,"signInAction")',
  ].join(";");

  assert.deepEqual(findServerActions(bundle), [
    { id: "00e500165cd8faed8172255465839a92526bf32b36", name: "endEverySessionAction" },
    { id: "003bbcfc7af6eb6fa344619c449cbc9e02f93ff511", name: "signInAction" },
  ]);
});

test("an action with no name in the bundle is still found", () => {
  assert.deepEqual(findServerActions('createServerReference)("' + "a".repeat(40) + '",a.callServer)'), [
    { id: "a".repeat(40), name: null },
  ]);
});

test("chunk paths come from the flight payload and the script tags, without duplicates", () => {
  const paths = findChunkPaths(LOGIN_HTML);
  assert.deepEqual(paths, [
    "/_next/static/immutable/chunks/login.js",
    "/_next/static/immutable/chunks/next.js",
  ]);
});

test("a flight error row is told apart from a value row", () => {
  assert.equal(flightErrorRow(SIGN_IN_OK_BODY), null);
  assert.deepEqual(flightErrorRow('0:{"a":"$@1"}\n1:E{"digest":"3779942419"}\n'), {
    row: "1",
    digest: "3779942419",
  });
});

test("a set-cookie list becomes the cookie header a browser would send back", () => {
  assert.equal(
    toCookieHeader([SESSION_COOKIE, "other=1; Path=/"]),
    "helmdeck_session=sess_abc.def456; other=1",
  );
  assert.equal(toCookieHeader([]), "");
});

test("a URL is required, and a trailing slash is not a different deployment", () => {
  assert.equal(normalizeBase("https://demo.example/"), "https://demo.example");
  assert.equal(normalizeBase("  https://demo.example/base//  "), "https://demo.example/base");
  assert.throws(() => normalizeBase(""), /A URL is required/);
  assert.throws(() => normalizeBase("demo.example"), /is not a URL/);
  assert.throws(() => normalizeBase("ftp://demo.example"), /not an http or https URL/);
});

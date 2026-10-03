// Watch the live demo for React #441 across the routes a signed-in operator actually visits.
//
// The error is an internal React one that fires when a fiber's flags diverge between the current tree
// and the work in progress, which is a server/client disagreement rather than anything a page's source
// shows. Three hypotheses have been tested and disproven, so the remaining move is to watch the real
// thing under navigation rather than to reason about it.
//
// Every console error and page error is recorded and the run reports whether #441 appeared, so a pass
// is an observation rather than an absence of looking.
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "https://helmdeck.yesvus.com";
const PASSWORD = "helmdeck-demo";
const EMAIL = "owner@demo.helmdeck.dev";

const ROUTES = [
  "/dashboard",
  "/dashboard/tiles",
  "/dashboard/arrange",
  "/shell",
  "/shell/products",
  "/shell/products/new",
  "/shell/orders",
  "/shell/customers",
  "/shell/content",
  "/shell/media",
  "/shell/analytics",
  "/shell/settings/site",
  "/shell/schedule",
  "/shell/shipments",
  "/shell/profile",
  "/shell/studio",
  "/admin/login",
];

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push({ where: page.url(), text: error.message.slice(0, 220) }));
page.on("console", (message) => {
  if (message.type() === "error") {
    errors.push({ where: page.url(), text: message.text().slice(0, 220) });
  }
});

const staticFlag = () => errors.filter((e) => e.text.includes("Expected static flag"));

// Sign in, so the routes behind the session are the ones actually walked.
//
// **The seeded one-click buttons, not the password form.** Filling the form and submitting sent every
// route back to `/login?next=...`, which meant the run reported "17 routes visited" while exercising
// only the unauthenticated surface. The demo offers "Sign in as the admin", which is the same session
// without a form to get wrong, and the run below reports where each route actually landed so a silent
// redirect cannot be read as a pass again.
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
const seeded = page.getByRole("button", { name: /sign in as the admin/i });
if (await seeded.count()) {
  await seeded.first().click();
  // Waiting for the navigation, not for the login page's idle state. The click lands on /dashboard
  // asynchronously, so `networkidle` on the page that was already idle returned immediately and the
  // first `goto` raced the session cookie being set.
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20000 }).catch(() => {});
  await page.waitForLoadState("networkidle").catch(() => {});
} else {
  await page.locator('input[name="email"]').first().fill(EMAIL);
  await page.locator('input[name="password"]').first().fill(PASSWORD);
  await page.getByRole("button", { name: /^sign in$/i }).first().click();
  await page.waitForLoadState("networkidle").catch(() => {});
}

let visited = 0;
const bouncedRoutes = [];
const missingRoutes = [];
for (const route of ROUTES) {
  const before = errors.length;
  await page.goto(`${BASE}${route}`, { waitUntil: "networkidle", timeout: 45000 }).catch(() => {});
  // Interact a little, since the error is about a fiber changing shape rather than a page loading.
  await page.mouse.move(200, 200).catch(() => {});
  await page.waitForTimeout(700);
  const status = page.url().replace(BASE, "");
  const newErrors = errors.length - before;
  const bounced = status.startsWith("/login");
  // A route that 404s was never on the site, so walking it proves nothing and reading it as a pass is
  // how "/studio" — a path this list invented while `/shell/studio` is the real one — sat here looking
  // exercised.
  const missing = status.endsWith("/404") || newErrors > 0 && errors.at(-1)?.text.includes("404");
  visited += 1;
  if (bounced) bouncedRoutes.push(route);
  if (missing) missingRoutes.push(route);
  process.stdout.write(
    `  ${route.padEnd(28)} -> ${status.padEnd(28)}` +
      `${bounced ? " BOUNCED TO LOGIN" : ""}${missing ? " NOT FOUND" : ""}` +
      `${newErrors > 0 ? ` ${newErrors} error(s)` : ""}\n`,
  );
}

process.stdout.write(`\n  visited ${visited} routes, ${errors.length} error(s) recorded\n`);
if (missingRoutes.length > 0) {
  process.stdout.write(
    `  ${missingRoutes.length} route(s) do not exist on this site and were NOT exercised: ` +
      `${missingRoutes.join(", ")}\n`,
  );
}
if (bouncedRoutes.length > 0) {
  process.stdout.write(
    `  ${bouncedRoutes.length} route(s) bounced to /login, so they were NOT exercised: ` +
      `${bouncedRoutes.join(", ")}\n`,
  );
}
if (staticFlag().length > 0) {
  process.stdout.write(`  REACT #441 SEEN ${staticFlag().length} time(s):\n`);
  for (const e of staticFlag().slice(0, 5)) process.stdout.write(`    ${e.where}: ${e.text}\n`);
} else {
  process.stdout.write("  #441 did not appear\n");
}
const others = [...new Set(errors.map((e) => e.text))].filter((t) => !t.includes("Expected static flag"));
for (const text of others.slice(0, 8)) process.stdout.write(`    other: ${text}\n`);

await browser.close();

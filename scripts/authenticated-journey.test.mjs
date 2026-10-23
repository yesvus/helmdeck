import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const PORT = 3299;
const server = spawn("pnpm", ["exec", "next", "start", "fixtures", "--port", String(PORT)], {
  detached: true,
  stdio: "ignore",
  env: { ...process.env, CI: "1" },
});
let browser;
let serverFailure;
server.once("error", (error) => { serverFailure = error; });
server.once("exit", (code, signal) => {
  serverFailure = new Error(`fixture server exited before readiness: code=${code}, signal=${signal}`);
});

try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (server.exitCode !== null || server.signalCode !== null || serverFailure) {
      throw serverFailure ?? new Error(`fixture server exited before readiness`);
    }
    try {
      const response = await globalThis.fetch(`http://127.0.0.1:${PORT}/login`);
      if (response.ok) { ready = true; break; }
    } catch { await delay(0); }
    await delay(1000);
  }
  assert.ok(ready, "fixture server did not start");

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, reducedMotion: "reduce" });

  // Sign in as the seeded administrator.
  await page.goto(`http://127.0.0.1:${PORT}/login`);
  await page.getByRole("button", { name: /Sign in as the admin/i }).click();
  await page.waitForURL(/\/dashboard|\/shell/, { timeout: 15000 });

  // Open the content list and create a new post.
  await page.goto(`http://127.0.0.1:${PORT}/shell/content`);
  const newLink = page.getByRole("link", { name: /New/i }).first();
  await newLink.click();
  await page.waitForURL(/\/shell\/content\/new/, { timeout: 15000 });

  const title = `Journey post ${Date.now()}`;
  await page.getByLabel(/Title/i).first().fill(title);
  await page.getByRole("button", { name: /Save|Create/i }).first().click();

  // The form saves and returns to the list (or stays with a success message).
  await page.waitForTimeout(1000);

  // Verify persistence: reload the list and check the title is there.
  await page.goto(`http://127.0.0.1:${PORT}/shell/content`);
  await page.waitForTimeout(1000);
  const bodyText = await page.textContent("body");
  assert.ok(bodyText && bodyText.includes(title), `saved post "${title}" not found after reload`);

  // Sign out.
  const more = page.getByText("More").first();
  if (await more.isVisible().catch(() => false)) {
    await more.click();
    const signOut = page.getByRole("button", { name: /Sign out/i }).first();
    if (await signOut.isVisible().catch(() => false)) await signOut.click();
  }
  await page.waitForTimeout(500);
} finally {
  if (browser) await browser.close();
  try { process.kill(-server.pid, "SIGTERM"); } catch { /* already stopped */ }
try { server.kill("SIGTERM"); } catch { /* already stopped */ }
}

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const server = spawn("pnpm", ["exec", "next", "start", "fixtures", "--port", "3217"], {
  stdio: "ignore",
  env: { ...process.env, CI: "1" },
});
let browser;

try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await globalThis.fetch("http://127.0.0.1:3217/primitives");
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      await delay(0);
    }
    await delay(1000);
  }
  assert.ok(ready, "fixture server did not start");

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, reducedMotion: "reduce" });
  await page.goto("http://127.0.0.1:3217/primitives");
  await page.getByRole("button", { name: "Open modal" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible" });
  await page.waitForTimeout(200);
  const centered = await dialog.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
  assert.ok(Math.abs(centered.x + centered.width / 2 - 640) <= 1, JSON.stringify(centered));
  assert.ok(Math.abs(centered.y + centered.height / 2 - 360) <= 1, JSON.stringify(centered));

  await page.goto("http://127.0.0.1:3217/media");
  await page.getByRole("button", { name: "Open full media picker" }).click();
  const mediaDialog = page.getByRole("dialog");
  await mediaDialog.waitFor({ state: "visible" });
  const media = await mediaDialog.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
  assert.ok(Math.abs(media.x + media.width / 2 - 640) <= 1, JSON.stringify(media));
  assert.ok(Math.abs(media.y + media.height / 2 - 360) <= 1, JSON.stringify(media));

  const custom = await page.evaluate(() => {
    const element = globalThis.document.createElement("div");
    element.className = "fixed right-4 top-4";
    element.style.width = "160px";
    element.style.height = "80px";
    element.textContent = "custom placement";
    globalThis.document.body.append(element);
    const rect = element.getBoundingClientRect();
    element.remove();
    return { x: rect.x, y: rect.y, width: rect.width };
  });
  assert.deepEqual(custom, { x: 1104, y: 16, width: 160 });
  process.stdout.write(`${JSON.stringify({ centered, media, custom })}\n`);
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}

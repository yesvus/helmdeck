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
let serverFailure;
server.once("error", (error) => {
  serverFailure = error;
});
server.once("exit", (code, signal) => {
  serverFailure = new Error(`fixture server exited before readiness: code=${code}, signal=${signal}`);
});

try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (server.exitCode !== null || server.signalCode !== null || serverFailure) {
      throw serverFailure ?? new Error(`fixture server exited before readiness: code=${server.exitCode}, signal=${server.signalCode}`);
    }
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

  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Open custom placement" }).click();
  const customDialog = page.getByRole("dialog", { name: "Custom placement dialog" });
  await customDialog.waitFor({ state: "visible" });
  await page.waitForTimeout(200);
  const custom = await customDialog.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
  assert.deepEqual(custom, { x: 32, y: 48, width: 160, height: 80 });
  await page.keyboard.press("Escape");
  await customDialog.waitFor({ state: "hidden" });

  await page.getByRole("button", { name: "Open responsive sizing" }).click();
  const responsiveDialog = page.getByRole("dialog", { name: "Responsive sizing dialog" });
  await responsiveDialog.waitFor({ state: "visible" });
  await page.waitForTimeout(200);
  const desktopResponsiveWidth = await responsiveDialog.evaluate((element) => element.getBoundingClientRect().width);
  assert.equal(desktopResponsiveWidth, 896);
  await page.keyboard.press("Escape");
  await responsiveDialog.waitFor({ state: "hidden" });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open responsive sizing" }).click();
  await responsiveDialog.waitFor({ state: "visible" });
  await page.waitForTimeout(200);
  const mobileResponsive = await responsiveDialog.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, width: rect.width };
  });
  assert.deepEqual(mobileResponsive, { x: 16, width: 358 });
  await page.keyboard.press("Escape");
  await responsiveDialog.waitFor({ state: "hidden" });

  await page.goto("http://127.0.0.1:3217/media");
  await page.getByText("5 demo records available through the adapter.", { exact: true }).waitFor({ state: "attached" });
  for (const [title, description] of [
    ["Upload", "Progress and errors stay inside the reusable workflow."],
    ["Form field", "Selection serializes into a normal form value."],
    ["Library", "5 demo records available through the adapter."],
  ]) {
    const descriptionText = page.getByText(description, { exact: true });
    assert.equal(await descriptionText.isVisible(), false, `${title} description should be hidden until help opens`);
    await page.getByRole("button", { name: `Help: ${title}` }).click();
    const tooltip = page.getByRole("tooltip");
    await tooltip.waitFor({ state: "visible" });
    assert.equal(await tooltip.innerText(), description);
    await page.keyboard.press("Escape");
    await tooltip.waitFor({ state: "hidden" });
  }

  await page.setViewportSize({ width: 1024, height: 683 });
  await page.getByRole("button", { name: "Select media", exact: true }).click();
  const fieldDialog = page.getByRole("dialog", { name: "Cover image" });
  await fieldDialog.waitFor({ state: "visible" });
  await page.waitForTimeout(200);
  const fieldLayout = await fieldDialog.evaluate((element) => {
    const dialog = element.getBoundingClientRect();
    const search = element.querySelector('input[aria-label="Search media"]')?.getBoundingClientRect();
    const sort = element.querySelector('select[aria-label="Sort media"]')?.getBoundingClientRect();
    const card = element.querySelector(".grid > button")?.getBoundingClientRect();
    return {
      x: dialog.x,
      y: dialog.y,
      width: dialog.width,
      height: dialog.height,
      searchRight: search?.right,
      sortLeft: sort?.left,
      cardWidth: card?.width,
    };
  });
  assert.ok(fieldLayout.width >= 900, JSON.stringify(fieldLayout));
  assert.ok(fieldLayout.y >= 0 && fieldLayout.y + fieldLayout.height <= 683, JSON.stringify(fieldLayout));
  assert.ok(fieldLayout.searchRight !== undefined && fieldLayout.sortLeft !== undefined && fieldLayout.searchRight <= fieldLayout.sortLeft, JSON.stringify(fieldLayout));
  assert.ok((fieldLayout.cardWidth ?? 0) >= 180, JSON.stringify(fieldLayout));
  await page.keyboard.press("Escape");
  await fieldDialog.waitFor({ state: "hidden" });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open full media picker" }).click();
  const mediaDialog = page.getByRole("dialog");
  await mediaDialog.waitFor({ state: "visible" });
  await page.waitForTimeout(200);
  const media = await mediaDialog.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
  const mediaControls = await mediaDialog.evaluate((element) => {
    const search = element.querySelector('input[aria-label="Search media"]')?.getBoundingClientRect();
    const sort = element.querySelector('select[aria-label="Sort media"]')?.getBoundingClientRect();
    const card = element.querySelector(".grid > button")?.getBoundingClientRect();
    return {
      search: search && { left: search.left, right: search.right, top: search.top, bottom: search.bottom, width: search.width },
      sort: sort && { left: sort.left, right: sort.right, top: sort.top, bottom: sort.bottom, width: sort.width },
      card: card && { width: card.width },
    };
  });
  assert.ok(Math.abs(media.x + media.width / 2 - 195) <= 1, JSON.stringify(media));
  assert.ok(Math.abs(media.y + media.height / 2 - 422) <= 1, JSON.stringify(media));
  assert.ok(media.width >= 350, JSON.stringify(media));
  assert.ok(mediaControls.search && mediaControls.sort && (mediaControls.search.right <= mediaControls.sort.left || mediaControls.search.bottom <= mediaControls.sort.top), JSON.stringify(mediaControls));
  assert.ok((mediaControls.card?.width ?? 0) >= 280, JSON.stringify(mediaControls));

  await page.goto("http://127.0.0.1:3217/shell/profile");
  await page.getByRole("heading", { name: "Profile", exact: true }).waitFor();
  assert.equal(await page.getByText("Alex Morgan", { exact: true }).isVisible(), true);
  assert.equal(await page.getByRole("heading", { name: "Alex Morgan", exact: true }).count(), 0);

  process.stdout.write(`${JSON.stringify({ centered, fieldLayout, media, mediaControls, custom })}\n`);
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}

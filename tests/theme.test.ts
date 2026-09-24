import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { contrastingTextHex } from "../src/theme/color.js";
import { buttonVariants } from "../src/primitives/button.js";

function luminance(hex: string) {
  const channels = hex.match(/[\da-f]{2}/gi)!.map((part) => parseInt(part, 16) / 255).map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

describe("theme tokens", () => {
  it("defines light and dark semantic tokens and an AA amber action color", () => {
    const css = readFileSync(resolve("src/theme/tokens.css"), "utf8");
    expect(css).toContain('[data-admin-theme="light"]');
    expect(css).toContain('[data-admin-theme="dark"]');
    expect(css).toContain("@theme inline");
    expect(css).not.toContain("--color-white:");
    expect(css).toContain("--admin-brand-500: #b45309");
    const nav = readFileSync(resolve("src/shell/admin-nav.tsx"), "utf8");
    expect(nav.match(/bg-brand-500 !text-white/g)).toHaveLength(3);
    expect(nav).toContain('aria-current={active ? "page" : undefined}');
    expect(nav).toContain("after:bg-white/70");
    const ratio = (luminance("ffffff") + 0.05) / (luminance("b45309") + 0.05);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    expect(css).toContain("--admin-overlay:");
    expect(css).toContain("--admin-danger-action:");
    expect(css).toContain("--admin-success-border:");
    expect(contrastingTextHex("#facc15")).toBe("#1c1917");
    expect(contrastingTextHex("#123456")).toBe("#ffffff");
    expect(buttonVariants({ variant: "destructive" })).toContain("text-admin-on-danger");
    expect(buttonVariants({ variant: "destructive" })).not.toContain("text-admin-on-brand");
    expect(buttonVariants({ variant: "success" })).toContain("text-admin-on-success");
    expect(buttonVariants({ variant: "success" })).not.toContain("text-admin-on-brand");
    expect((luminance("ffffff") + 0.05) / (luminance("dc2626") + 0.05)).toBeGreaterThanOrEqual(4.5);
    expect((luminance("ffffff") + 0.05) / (luminance("15803d") + 0.05)).toBeGreaterThanOrEqual(4.5);
  });
});

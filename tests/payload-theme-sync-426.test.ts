import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveAdminThemeAttrs } from "../examples/payload-host/lib/payload/theme-attrs";
import { resolvePayloadDocumentTheme } from "../examples/payload-host/lib/payload/theme-attrs";
import { writeAdminThemeCookie } from "../src/theme/preference-boot";

describe("Payload theme sync", () => {
  it("maps Helmdeck accent, density and both mode attributes", () => {
    const css = readFileSync(resolve(process.cwd(), "src/payload/payload-theme.css"), "utf8");
    expect(css).toContain("--admin-brand-accent: var(--admin-brand-500)");
    expect(css).toContain("--theme-primary-500: var(--admin-brand-accent)");
    expect(css).toContain("--style-spacing-m: calc(1rem * var(--admin-density))");
    expect(css).toContain("[data-theme='dark']");
    expect(css).toContain("[data-admin-theme='dark']");
  });

  it("resolves stored accent and density to surface attributes and variables", () => {
    expect(resolveAdminThemeAttrs({ accent: " #123abc ", density: "cosy" })).toEqual({
      "data-theme": "light",
      "data-admin-theme": "light",
      "data-admin-accent": "#123abc",
      "data-admin-density": "spacious",
      style: {
        "--admin-brand-500": "#123abc",
        "--theme-primary-500": "#123abc",
        "--theme-accent": "#123abc",
        "--admin-density": "1.15",
      },
    });
  });

  it("resolves the Payload document mode from its cookie and settings", () => {
    expect(resolvePayloadDocumentTheme("v1:dark", { accent: "#123abc", density: "compact" })).toMatchObject({
      mode: "dark",
      attrs: { "data-theme": "dark", "data-admin-theme": "dark", "data-admin-accent": "#123abc", "data-admin-density": "compact" },
    });
  });

  it("writes the resolved mode into the shared cookie", () => {
    const target = { cookie: "" };
    Object.defineProperty(globalThis, "document", { configurable: true, value: target });
    writeAdminThemeCookie("dark");
    expect(target.cookie).toBe("helmdeck_theme=v1:dark; Path=/; SameSite=Lax");
    delete (globalThis as { document?: unknown }).document;
  });
});

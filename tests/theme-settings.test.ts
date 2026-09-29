// SPDX-License-Identifier: MIT
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "../src/theme/color.js";
import {
  ADMIN_SURFACES,
  ADMIN_TEXT_CONTRAST,
  adminBrandVariables,
} from "../src/theme/branding.js";
import {
  DEFAULT_ADMIN_THEME_SETTINGS,
  adminThemeSettingsStyle,
  resolveAdminThemeSettings,
} from "../src/theme/settings.js";
import { ADMIN_DENSITY_SCALE } from "../src/theme/density.js";

/**
 * A host that can set an accent can also set an unreadable one. `useAdminBranding` used to
 * take any hex and pair it with a label colour chosen by a luminance threshold, which is a
 * coin flip in the middle of the range: #808080 reads at 4.43:1 with ink and 3.95:1 with
 * white, so the button was illegible and nothing said so. The settings layer refuses that
 * range, and the checks below are what hold it there.
 */
const TOKENS = readFileSync(join(process.cwd(), "src/theme/tokens.css"), "utf8");

/** Every 3-digit hex, which is the whole 4096-entry RGB cube at one decimal place per channel. */
function everyShortHex(): string[] {
  const hexes: string[] = [];
  for (let r = 0; r < 16; r += 1) {
    for (let g = 0; g < 16; g += 1) {
      for (let b = 0; b < 16; b += 1) {
        hexes.push(`#${[r, g, b].map((channel) => channel.toString(16).repeat(2)).join("")}`);
      }
    }
  }
  return hexes;
}

function surfaceValue(token: string, mode: "light" | "dark"): string {
  const block =
    mode === "light"
      ? css.slice(css.indexOf(':root,\n[data-admin-theme="light"]'))
      : css.slice(css.indexOf('[data-admin-theme="dark"]'));
  return new RegExp(`${token}:\\s*([^;]+);`).exec(block)?.[1] ?? "";
}

const css = TOKENS;

describe("an accent a host chooses is checked before it reaches the page", () => {
  it("keeps the surfaces this file measures against in step with tokens.css", () => {
    // Two sources for one fact is how a checked constant quietly stops being checked, so the
    // values here are read back out of the stylesheet the package ships.
    expect(ADMIN_SURFACES.light.surface).toBe(surfaceValue("--admin-surface", "light"));
    expect(ADMIN_SURFACES.light.subtle).toBe(surfaceValue("--admin-surface-subtle", "light"));
    expect(ADMIN_SURFACES.dark.surface).toBe(surfaceValue("--admin-surface", "dark"));
    expect(ADMIN_SURFACES.dark.subtle).toBe(surfaceValue("--admin-surface-subtle", "dark"));
  });

  it("clears the text threshold on every colour pair an accepted accent produces", () => {
    const accepted: string[] = [];
    const refused: string[] = [];
    for (const accent of everyShortHex()) {
      const variables = adminBrandVariables(accent, "light");
      if (!variables) {
        refused.push(accent);
        continue;
      }
      accepted.push(accent);
      const pairs: Array<[string, string]> = [
        [variables["--admin-on-brand"], variables["--admin-brand-500"]],
        [variables["--admin-on-brand"], variables["--admin-brand-600"]],
        [variables["--admin-brand-text"], ADMIN_SURFACES.light.surface],
        [variables["--admin-brand-text"], ADMIN_SURFACES.light.subtle],
      ];
      const dark = adminBrandVariables(accent, "dark");
      if (!dark) throw new Error(`refusal flipped with the mode for ${accent}`);
      pairs.push(
        [dark["--admin-brand-text"], ADMIN_SURFACES.dark.surface],
        [dark["--admin-brand-text"], ADMIN_SURFACES.dark.subtle],
      );
      for (const [from, onto] of pairs) {
        const ratio = contrastRatio(from, onto);
        if (ratio === null || ratio < ADMIN_TEXT_CONTRAST) {
          throw new Error(`${accent}: ${from} on ${onto} is ${ratio ?? "unresolvable"}:1`);
        }
      }
    }
    // Both lists are populated, so the loop is proving something rather than passing on an
    // empty sweep. A rule that refused everything would leave the accepted list empty.
    expect(accepted.length).toBeGreaterThan(3000);
    expect(refused.length).toBeGreaterThan(0);
    expect(accepted.length + refused.length).toBe(4096);
    // A deep blue and a light amber, which is the range most brand colours fall in.
    expect(accepted).toContain("#1122dd");
    expect(accepted).toContain("#ffee88");
  });

  it("accepts the accent the package ships by default", () => {
    // `#b45309` is a 6-digit value, so it is not in the 3-digit cube the sweep walks. It gets
    // its own check rather than a containment assertion that can never fail.
    expect(adminBrandVariables("#b45309")).not.toBeNull();
    expect(resolveAdminThemeSettings({ accent: "#b45309" }).problems).toEqual([]);
  });

  it("refuses a mid-tone no label colour can read on, and says why", () => {
    // #808080 is 4.43:1 with ink and 3.95:1 with white, so this is the band the refusal is for.
    expect(adminBrandVariables("#808080")).toBeNull();
    const { settings, problems } = resolveAdminThemeSettings({ accent: "#808080" });
    expect(settings.accent).toBeNull();
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ setting: "accent", value: "#808080" });
    expect(problems[0].reason).toContain("4.5:1");
  });

  it("picks the label colour that clears the threshold, not the one a threshold names", () => {
    // A light accent takes ink, a dark one takes white, and the hover shade is covered by the
    // same single label colour rather than a second one.
    expect(adminBrandVariables("#facc15")?.["--admin-on-brand"]).toBe("#1c1917");
    expect(adminBrandVariables("#1d4ed8")?.["--admin-on-brand"]).toBe("#ffffff");
    const light = adminBrandVariables("#1d4ed8");
    const ratio = contrastRatio(light!["--admin-on-brand"], light!["--admin-brand-600"]);
    expect(ratio).toBeGreaterThanOrEqual(ADMIN_TEXT_CONTRAST);
  });

  it("derives a brand text that stays readable for an accent whose own mix would not", () => {
    // 80% of #fde68a on white is about 0.5:1, which is the reason --admin-brand-text is
    // derived here rather than copied from the color-mix the default palette uses.
    const variables = adminBrandVariables("#fde68a", "light");
    expect(variables).not.toBeNull();
    expect(contrastRatio(variables!["--admin-brand-text"], ADMIN_SURFACES.light.surface)!)
      .toBeGreaterThanOrEqual(ADMIN_TEXT_CONTRAST);
    // And it is still recognisably the accent, not black.
    expect(variables!["--admin-brand-text"]).not.toBe("#000000");
  });
});

describe("theme settings are declared, defaulted and validated", () => {
  it("gives a host that changes nothing the palette and density that already worked", () => {
    const { settings, problems } = resolveAdminThemeSettings(undefined);
    expect(settings).toEqual(DEFAULT_ADMIN_THEME_SETTINGS);
    expect(problems).toEqual([]);
    // A null accent contributes no brand variables at all, so tokens.css keeps standing and
    // the contrast suite keeps describing what a host actually renders.
    expect(adminThemeSettingsStyle(settings)).toEqual({
      "--admin-density": ADMIN_DENSITY_SCALE.comfortable,
    } as unknown as ReturnType<typeof adminThemeSettingsStyle>);
  });

  it("turns a partial or untrusted value into a full, usable set of settings", () => {
    expect(resolveAdminThemeSettings({ density: "compact" }).settings).toEqual({
      density: "compact",
      accent: null,
    });
    expect(resolveAdminThemeSettings({ accent: "#1D4ED8" }).settings).toEqual({
      density: "comfortable",
      accent: "#1d4ed8",
    });
    expect(resolveAdminThemeSettings({ accent: "" }).problems).toEqual([]);
    expect(resolveAdminThemeSettings({ accent: "" }).settings.accent).toBeNull();
  });

  it("reports each unusable setting and falls back rather than throwing", () => {
    const { settings, problems } = resolveAdminThemeSettings({
      density: "cosy",
      accent: "rebeccapurple",
      fontFamily: "Inter",
    });
    expect(settings).toEqual(DEFAULT_ADMIN_THEME_SETTINGS);
    expect(problems.map((problem) => problem.setting)).toEqual(["fontFamily", "density", "accent"]);
    expect(problems.every((problem) => problem.reason.length > 0)).toBe(true);
    // An array is a settings value that is not a settings object, and the report says so
    // rather than silently reading numeric keys off it.
    expect(resolveAdminThemeSettings([]).problems[0].reason).toContain("object");
  });

  it("writes only the custom properties its settings name, per mode", () => {
    const { settings } = resolveAdminThemeSettings({ density: "spacious", accent: "#1d4ed8" });
    const light = adminThemeSettingsStyle(settings, "light") as Record<string, string>;
    const dark = adminThemeSettingsStyle(settings, "dark") as Record<string, string>;
    expect(light["--admin-density"]).toBe("1.15");
    expect(Object.keys(light).sort()).toEqual([
      "--admin-brand-100",
      "--admin-brand-500",
      "--admin-brand-600",
      "--admin-brand-text",
      "--admin-density",
      "--admin-on-brand",
    ]);
    // Only brand text is mode-dependent, because that is the one token tokens.css derives
    // per mode. Everything else has to be identical or a mode switch would change the button.
    expect({ ...light, "--admin-brand-text": "" }).toEqual({ ...dark, "--admin-brand-text": "" });
    expect(light["--admin-brand-text"]).not.toBe(dark["--admin-brand-text"]);
  });
});

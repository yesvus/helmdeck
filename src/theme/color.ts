// SPDX-License-Identifier: MIT
type Rgb = { r: number; g: number; b: number };

function parseHex(hex: string): Rgb | null {
  const value = hex.trim().replace(/^#/, "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((char) => char + char)
          .join("")
      : value;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    return null;
  }
  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16),
  };
}

function toHex({ r, g, b }: Rgb): string {
  const channel = (value: number) =>
    Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

export function normalizeHex(hex: string): string | null {
  const rgb = parseHex(hex);
  return rgb ? toHex(rgb) : null;
}

/** WCAG relative luminance. Null for a value that is not a hex colour. */
function relativeLuminance(hex: string): number | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  return [rgb.r, rgb.g, rgb.b]
    .map((channel) => channel / 255)
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
}

/**
 * WCAG contrast between two hex colours, or null when either cannot be read. Callers that
 * decide whether to accept a value need the number, and a value they cannot resolve has to
 * read as a failure rather than as a passing zero.
 */
export function contrastRatio(foreground: string, background: string): number | null {
  const from = relativeLuminance(foreground);
  const onto = relativeLuminance(background);
  if (from === null || onto === null) return null;
  const [high, low] = from > onto ? [from, onto] : [onto, from];
  return (high + 0.05) / (low + 0.05);
}

export function contrastingTextHex(hex: string): string | null {
  const luminance = relativeLuminance(hex);
  if (luminance === null) return null;
  return luminance > 0.179 ? "#1c1917" : "#ffffff";
}

export function mixHex(hex: string, target: Rgb, ratio: number): string | null {
  const base = parseHex(hex);
  if (!base) {
    return null;
  }
  return toHex({
    r: base.r + (target.r - base.r) * ratio,
    g: base.g + (target.g - base.g) * ratio,
    b: base.b + (target.b - base.b) * ratio,
  });
}

export function lightenHex(hex: string, ratio: number): string | null {
  return mixHex(hex, { r: 255, g: 255, b: 255 }, ratio);
}

export function darkenHex(hex: string, ratio: number): string | null {
  return mixHex(hex, { r: 0, g: 0, b: 0 }, ratio);
}

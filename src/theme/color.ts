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

"use client";

import { useEffect, useState } from "react";
import { AdminThemePreference, contrastingTextHex, useAdminTheme } from "@yesvus/helmdeck";

type Preset = {
  brand: string;
  surface: string;
  font: string;
  spacing: string;
  radius: string;
  density: string;
  mode: "light" | "dark";
  theme: "light" | "dark" | "system";
};

const initial: Preset = {
  brand: "#b45309",
  surface: "#ffffff",
  font: "inherit",
  spacing: "1rem",
  radius: "0.75rem",
  density: "1",
  mode: "light",
  theme: "light",
};

const defaultSurfaces: Record<Preset["mode"], string> = {
  light: "#ffffff",
  dark: "#1c1917",
};

export function ThemeControls() {
  const { theme, resolvedTheme, ready, setTheme } = useAdminTheme();
  const [preset, setPreset] = useState(() => ({ ...initial, mode: resolvedTheme, theme }));
  const [importValue, setImportValue] = useState("");
  const [feedback, setFeedback] = useState("");

  // The preset mirrors the shell theme, so a change to either is applied in the same
  // render rather than a commit later, where the CSS effect below would see a stale mode.
  // A preset that disagrees with the shell, such as one just imported, is normalized here
  // too, because the CSS effect only writes tokens when the two agree.
  const [syncedTheme, setSyncedTheme] = useState({ resolvedTheme, theme });
  if (
    syncedTheme.resolvedTheme !== resolvedTheme
    || syncedTheme.theme !== theme
    || preset.mode !== resolvedTheme
    || preset.theme !== theme
  ) {
    setSyncedTheme({ resolvedTheme, theme });
    setPreset((current) => ({
      ...current,
      mode: resolvedTheme,
      theme,
      surface: current.surface === defaultSurfaces[current.mode] ? defaultSurfaces[resolvedTheme] : current.surface,
    }));
  }

  useEffect(() => {
    if (!ready || preset.mode !== resolvedTheme) return;
    const root = document.documentElement;
    root.style.setProperty("--admin-brand-500", preset.brand);
    root.style.setProperty("--admin-brand-600", preset.brand);
    root.style.setProperty("--admin-brand-100", `${preset.brand}26`);
    root.style.setProperty("--admin-on-brand", contrastingTextHex(preset.brand) ?? "#ffffff");
    root.style.setProperty("--admin-surface", preset.surface);
    root.style.setProperty("--admin-font-family", preset.font);
    root.style.setProperty("--admin-spacing", preset.spacing);
    root.style.setProperty("--admin-radius", preset.radius);
    root.style.setProperty("--admin-density", preset.density);
    root.style.fontFamily = "var(--admin-font-family)";
  }, [preset, ready, resolvedTheme]);

  function update<K extends keyof Preset>(key: K, value: Preset[K]) {
    setPreset((current) => ({ ...current, [key]: value }));
  }

  function updateMode(mode: Preset["mode"]) {
    setPreset((current) => ({
      ...current,
      mode,
      theme: mode,
      surface: current.surface === defaultSurfaces[current.mode]
        ? defaultSurfaces[mode]
        : current.surface,
    }));
  }

  function selectTheme(value: "light" | "dark" | "system") {
    if (value === "system") {
      setPreset((current) => ({ ...current, theme: value }));
      return;
    }
    updateMode(value);
  }

  function importPreset() {
    try {
      const parsed: unknown = JSON.parse(importValue);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        setFeedback("Preset must be a JSON object.");
        return;
      }
      const values = parsed as Record<string, unknown>;
      const allowed = Object.keys(initial);
      const invalidKey = Object.keys(values).find((key) => !allowed.includes(key));
      if (invalidKey) {
        setFeedback(`Unknown preset field: ${invalidKey}.`);
        return;
      }
      const options: Record<string, readonly string[]> = {
        font: ["inherit", "Arial, sans-serif", "Georgia, serif", "monospace"],
        spacing: ["0.75rem", "1rem", "1.25rem"],
        radius: ["0.25rem", "0.75rem", "1.25rem"],
        density: ["0.85", "1", "1.15"],
        mode: ["light", "dark"],
        theme: ["light", "dark", "system"],
      };
      for (const [key, value] of Object.entries(values)) {
        const validColor = (key === "brand" || key === "surface") && typeof value === "string" && /^#[\da-f]{6}$/i.test(value);
        const validOption = options[key]?.includes(value as string) ?? false;
        if (!validColor && !validOption) {
          setFeedback(`Invalid value for ${key}.`);
          return;
        }
      }
      const imported = { ...initial, ...values } as Preset;
      imported.theme = (values.theme as Preset["theme"] | undefined) ?? imported.mode;
      if (!Object.hasOwn(values, "surface")) imported.surface = defaultSurfaces[imported.mode];
      setPreset(imported);
      setTheme(imported.theme);
      setFeedback("Theme preset imported.");
    } catch {
      setFeedback("Preset must contain valid JSON.");
    }
  }

  async function exportPreset() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(JSON.stringify(preset, null, 2));
      setFeedback("Theme preset copied.");
    } catch {
      setFeedback("Clipboard export is unavailable in this browser.");
    }
  }

  const fields: Array<[keyof Preset, string, string[]?]> = [
    ["brand", "Primary color"],
    ["surface", "Surface color"],
    ["font", "Typography", ["inherit", "Arial, sans-serif", "Georgia, serif", "monospace"]],
    ["spacing", "Spacing", ["0.75rem", "1rem", "1.25rem"]],
    ["radius", "Radius", ["0.25rem", "0.75rem", "1.25rem"]],
    ["density", "Density", ["0.85", "1", "1.15"]],
  ];

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div><h1 className="text-2xl font-bold">Theme editor</h1><p className="text-sm text-zinc-600">Customize design tokens and preview changes live.</p></div>
        <AdminThemePreference onThemeChange={selectTheme} />
      </header>
      <section aria-label="Theme settings" className="grid gap-4 rounded-xl border border-zinc-200 bg-admin-surface p-5 sm:grid-cols-2">
        {fields.map(([key, label, options]) => <label key={key} className="grid gap-2 text-sm font-semibold">{label}
          {options ? <select className="rounded-md border border-zinc-300 bg-admin-surface px-3 py-2 font-normal" value={preset[key] as string} onChange={(event) => update(key, event.target.value as never)}>{options.map((option) => <option key={option}>{option}</option>)}</select> : <input aria-label={label} type="color" className="h-10 w-full rounded border border-zinc-300" value={preset[key] as string} onChange={(event) => update(key, event.target.value as never)} />}
        </label>)}
      </section>
      <section aria-label="Live theme preview" className="space-y-3 rounded-xl border border-zinc-200 bg-admin-surface p-6" style={{ padding: `${Number.parseFloat(preset.spacing) * Number(preset.density)}rem`, borderRadius: "var(--admin-radius)", backgroundColor: "var(--admin-surface)", color: "var(--admin-text-primary)" }}>
        <h2 className="text-lg font-bold">Preview</h2><p className="text-zinc-600">Semantic text and surfaces adapt to the selected theme.</p>
        <button type="button" className="rounded-lg bg-brand-500 px-4 py-2 font-semibold text-admin-on-brand">Primary action</button>
      </section>
      <section aria-label="Host content dark-mode preview" data-theme-preview="admin-theme-dark-preview" className="space-y-4 rounded-xl border border-neutral-200 bg-white p-6 text-neutral-950">
        <div>
          <h2 className="text-lg font-bold">Host content</h2>
          <p className="text-sm">Standard host utility classes and elements follow the selected dark theme.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-medium">Name
            <input aria-label="Host name" data-theme-preview="admin-theme-dark-preview" className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-neutral-950" defaultValue="Northstar" />
          </label>
          <label className="grid gap-1 text-sm font-medium">Status
            <select aria-label="Host status" data-theme-preview="admin-theme-dark-preview" className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-neutral-950" defaultValue="active">
              <option value="active">Active</option><option value="draft">Draft</option>
            </select>
          </label>
        </div>
        <table className="w-full border border-neutral-200 text-sm">
          <thead><tr className="bg-neutral-50"><th className="p-2 text-left">Record</th><th className="p-2 text-left">Status</th></tr></thead>
          <tbody><tr className="border-t border-neutral-200"><td className="p-2">Northstar</td><td className="p-2">Active</td></tr></tbody>
        </table>
      </section>
      <div className="flex flex-wrap gap-3">
        <button type="button" className="rounded-md border border-zinc-300 px-4 py-2" onClick={() => { setPreset(initial); setTheme("light"); setFeedback("Theme settings reset."); }}>Reset</button>
        <button type="button" className="rounded-md border border-zinc-300 px-4 py-2" onClick={() => void exportPreset()}>Export preset</button>
        <textarea aria-label="Theme preset JSON" className="min-h-20 flex-1 rounded-md border border-zinc-300 p-2" value={importValue} onChange={(event) => setImportValue(event.target.value)} placeholder="Paste preset JSON to import" />
        <button type="button" className="rounded-md border border-zinc-300 px-4 py-2" onClick={importPreset}>Import preset</button>
      </div>
      <p role="status" aria-live="polite">{feedback}</p>
    </main>
  );
}

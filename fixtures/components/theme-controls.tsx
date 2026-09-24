"use client";

import { useEffect, useState } from "react";

type Preset = {
  brand: string;
  surface: string;
  font: string;
  spacing: string;
  radius: string;
  density: string;
  mode: "light" | "dark";
};

const initial: Preset = {
  brand: "#b45309",
  surface: "#ffffff",
  font: "inherit",
  spacing: "1rem",
  radius: "0.75rem",
  density: "1",
  mode: "light",
};

export function ThemeControls() {
  const [preset, setPreset] = useState(initial);
  const [importValue, setImportValue] = useState("");

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.adminTheme = preset.mode;
    root.style.setProperty("--admin-brand-500", preset.brand);
    root.style.setProperty("--admin-brand-600", preset.brand);
    root.style.setProperty("--admin-brand-100", `${preset.brand}26`);
    root.style.setProperty("--admin-surface", preset.surface);
    root.style.setProperty("--admin-font-family", preset.font);
    root.style.setProperty("--admin-spacing", preset.spacing);
    root.style.setProperty("--admin-radius", preset.radius);
    root.style.setProperty("--admin-density", preset.density);
    root.style.fontFamily = "var(--admin-font-family)";
  }, [preset]);

  function update<K extends keyof Preset>(key: K, value: Preset[K]) {
    setPreset((current) => ({ ...current, [key]: value }));
  }

  function importPreset() {
    try {
      const parsed: unknown = JSON.parse(importValue);
      if (parsed && typeof parsed === "object") setPreset({ ...initial, ...(parsed as Partial<Preset>) });
    } catch {
      setImportValue("Invalid theme preset JSON");
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
        <label className="flex items-center gap-2 text-sm font-medium">Color mode
          <select aria-label="Color mode" className="rounded-md border border-zinc-300 bg-white px-3 py-2" value={preset.mode} onChange={(event) => update("mode", event.target.value as Preset["mode"])}>
            <option value="light">Light</option><option value="dark">Dark</option>
          </select>
        </label>
      </header>
      <section aria-label="Theme settings" className="grid gap-4 rounded-xl border border-zinc-200 bg-white p-5 sm:grid-cols-2">
        {fields.map(([key, label, options]) => <label key={key} className="grid gap-2 text-sm font-semibold">{label}
          {options ? <select className="rounded-md border border-zinc-300 bg-white px-3 py-2 font-normal" value={preset[key] as string} onChange={(event) => update(key, event.target.value as never)}>{options.map((option) => <option key={option}>{option}</option>)}</select> : <input aria-label={label} type="color" className="h-10 w-full rounded border border-zinc-300" value={preset[key] as string} onChange={(event) => update(key, event.target.value as never)} />}
        </label>)}
      </section>
      <section aria-label="Live theme preview" className="space-y-3 rounded-xl border border-zinc-200 bg-white p-6" style={{ padding: "var(--admin-spacing)", borderRadius: "var(--admin-radius)" }}>
        <h2 className="text-lg font-bold">Preview</h2><p className="text-zinc-600">Semantic text and surfaces adapt to the selected theme.</p>
        <button type="button" className="rounded-lg bg-brand-600 px-4 py-2 font-semibold text-white">Primary action</button>
      </section>
      <div className="flex flex-wrap gap-3">
        <button type="button" className="rounded-md border border-zinc-300 px-4 py-2" onClick={() => setPreset(initial)}>Reset</button>
        <button type="button" className="rounded-md border border-zinc-300 px-4 py-2" onClick={() => navigator.clipboard.writeText(JSON.stringify(preset, null, 2))}>Export preset</button>
        <textarea aria-label="Theme preset JSON" className="min-h-20 flex-1 rounded-md border border-zinc-300 p-2" value={importValue} onChange={(event) => setImportValue(event.target.value)} placeholder="Paste preset JSON to import" />
        <button type="button" className="rounded-md border border-zinc-300 px-4 py-2" onClick={importPreset}>Import preset</button>
      </div>
    </main>
  );
}

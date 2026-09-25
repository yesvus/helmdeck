"use client";

import { FixtureCard } from "../../../../components/fixture-card";
import { useDemoLocale } from "../../../../components/demo-i18n-provider";
import { useShellSettings } from "../../layout";
import { useState } from "react";

const accents = [
  { name: "Teal", value: "#048b8c" },
  { name: "Violet", value: "#7c3aed" },
  { name: "Amber", value: "#d97706" },
];

function ChoiceGroup({ label, options, active, onPick }: {
  label: string;
  options: Array<{ name: string; value: string }>;
  active: string;
  onPick: (value: string) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold text-zinc-800">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={active === option.value}
            onClick={() => onPick(option.value)}
            className={`rounded-md border px-3 py-2 text-sm transition-colors ${
              active === option.value
                ? "border-brand-500 bg-brand-500 text-white"
                : "border-zinc-200 bg-admin-surface hover:border-brand-500"
            }`}
          >
            {option.name}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export default function SiteSettingsPage() {
  const { role, setRole, accent, setAccent } = useShellSettings();
  const { copy } = useDemoLocale();
  const [saved, setSaved] = useState(false);
  const settingsCopy = copy.shellSettings;
  return (
    <FixtureCard title={settingsCopy.title}>
      <div className="space-y-6">
        <p className="text-sm text-zinc-600">{settingsCopy.description}</p>
        <ChoiceGroup
          label={settingsCopy.role}
          options={[{ name: settingsCopy.administrator, value: "admin" }, { name: settingsCopy.editor, value: "editor" }]}
          active={role}
          onPick={setRole}
        />
        <ChoiceGroup label={settingsCopy.accent} options={accents} active={accent} onPick={setAccent} />
        <section className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
          <h2 className="font-semibold text-zinc-900">Workspace profile</h2>
          <p className="mt-1 text-sm text-zinc-600">Northstar Supply · northstar.example</p>
          <p className="mt-2 text-xs text-zinc-500">Your workspace is on the Studio plan. 4 of 10 team seats are active.</p>
        </section>
        <section className="rounded-lg border border-zinc-200 p-4">
          <h2 className="font-semibold text-zinc-900">Account</h2>
          <p className="mt-1 text-sm text-zinc-600">Alex Morgan · alex@northstar.example</p>
          <p className="mt-2 text-xs text-zinc-500">Workspace administrator · Last active today</p>
        </section>
        <button type="button" onClick={() => setSaved(true)} className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2">Save preferences</button>
        {saved && <p role="status" className="text-sm text-emerald-700">Workspace preferences saved for this demo.</p>}
      </div>
    </FixtureCard>
  );
}

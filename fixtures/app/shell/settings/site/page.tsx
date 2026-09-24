"use client";

import { FixtureCard } from "../../../../components/fixture-card";
import { DemoLanguageSwitcher } from "../../../../components/demo-i18n-provider";
import { useShellSettings } from "../../layout";

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
                : "border-zinc-200 bg-white hover:border-brand-500"
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
  return (
    <FixtureCard title="Site settings">
      <div className="space-y-6">
        <p className="text-sm text-zinc-600">Manage workspace preferences and access settings.</p>
        <ChoiceGroup
          label="Preview role"
          options={[{ name: "Administrator", value: "admin" }, { name: "Editor", value: "editor" }]}
          active={role}
          onPick={setRole}
        />
        <ChoiceGroup label="Workspace accent" options={accents} active={accent} onPick={setAccent} />
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-zinc-800">Language</legend>
          <DemoLanguageSwitcher />
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-zinc-800">Settings</legend>
          <p className="text-sm text-zinc-600">Role, accent, and language preferences update this workspace preview.</p>
        </fieldset>
      </div>
    </FixtureCard>
  );
}

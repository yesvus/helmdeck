"use client";

import { useState, type ReactNode } from "react";
import { AdminShell } from "@yesvus/helmdeck";
import { sampleNav, sampleSession } from "../../nav";
import { DemoLanguageSwitcher } from "../../components/demo-i18n-provider";

const accents: Array<{ name: string; value: string }> = [
  { name: "Teal", value: "#048b8c" },
  { name: "Violet", value: "#7c3aed" },
  { name: "Amber", value: "#d97706" },
];

function Switcher({ label, options, active, onPick }: { label: string; options: Array<{ name: string; value: string }>; active: string; onPick: (value: string) => void }) {
  return (
    <span className="flex items-center gap-1 text-xs text-zinc-500">
      {label}
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onPick(option.value)}
          className={`rounded-md border px-2 py-1 transition-colors ${
            active === option.value
              ? "border-brand-500 bg-brand-500 text-white"
              : "border-zinc-200 bg-white hover:border-brand-500"
          }`}
        >
          {option.name}
        </button>
      ))}
    </span>
  );
}

export default function ShellLayout({ children }: { children: ReactNode }) {
  const [role, setRole] = useState("editor");
  const [accent, setAccent] = useState("#048b8c");

  return (
    <AdminShell
      nav={sampleNav}
      session={{ ...sampleSession, role }}
      homeHref="/shell"
      viewSiteHref="/"
      onLogout={() => window.alert("logout tapped")}
      brand={{
        label: "Demo",
        accent,
        logo: <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-sm font-bold text-white">D</span>,
      }}
      topbarExtra={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <DemoLanguageSwitcher />
          <Switcher label="Role" options={[{ name: "Admin", value: "admin" }, { name: "Editor", value: "editor" }]} active={role} onPick={setRole} />
          <Switcher label="Accent" options={accents} active={accent} onPick={setAccent} />
        </div>
      }
    >
      {children}
    </AdminShell>
  );
}

// SPDX-License-Identifier: MIT
"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { SaveSettingsState } from "@/lib/payload/settings-actions";
import { saveSettingsAction } from "@/lib/payload/settings-actions";

type Settings = {
  name?: string | null;
  accent?: string | null;
  support_email?: string | null;
  density?: string | null;
};

type Fields = { label: string; htmlFor: string; problem?: string };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
      {pending ? "Saving..." : "Save"}
    </button>
  );
}

function Section({ fields, children }: { fields: Fields; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      {fields.label}
      {children}
      {fields.problem ? (
        <span className="block text-xs text-red-700">{fields.problem}</span>
      ) : null}
    </label>
  );
}

/**
 * The settings form, with the host validation answered on the fields. A refusal keeps the input:
 * the values below the state stay the ones the reader typed, because only the state changes.
 */
export function SettingsForm({ settings }: { settings: Settings }) {
  const [state, action] = useActionState<SaveSettingsState, FormData>(saveSettingsAction, { ok: true, problems: [] });
  const problemOf = (key: string): string | undefined =>
    state.ok ? undefined : state.problems.find((problem) => problem.key === key)?.reason;

  return (
    <form action={action} className="space-y-4 max-w-lg">
      <Section fields={{ label: "Name", htmlFor: "name", problem: problemOf("name") }}>
        <input
          id="name"
          name="name"
          required
          minLength={2}
          maxLength={48}
          defaultValue={String(settings.name ?? "")}
          className="mt-1 w-full rounded border px-2 py-1"
        />
      </Section>
      <Section fields={{ label: "Accent", htmlFor: "accent", problem: problemOf("accent") }}>
        <input
          id="accent"
          name="accent"
          required
          minLength={4}
          maxLength={7}
          defaultValue={String(settings.accent ?? "")}
          className="mt-1 w-full rounded border px-2 py-1"
        />
      </Section>
      <Section fields={{ label: "Support email", htmlFor: "support_email", problem: problemOf("support_email") }}>
        <input
          id="support_email"
          name="support_email"
          type="email"
          required
          defaultValue={String(settings.support_email ?? "")}
          className="mt-1 w-full rounded border px-2 py-1"
        />
      </Section>
      <Section fields={{ label: "Density", htmlFor: "density", problem: problemOf("density") }}>
        <select
          id="density"
          name="density"
          defaultValue={String(settings.density ?? "comfortable")}
          className="mt-1 w-full rounded border px-2 py-1"
        >
          <option value="comfortable">Comfortable</option>
          <option value="compact">Compact</option>
          <option value="cosy">Cosy</option>
        </select>
      </Section>
      {state.ok ? null : <p className="text-sm text-red-700">The refused values stay below for another edit.</p>}
      <SubmitButton />
    </form>
  );
}

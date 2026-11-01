// SPDX-License-Identifier: MIT
"use client";

import { useEffect, useState, type FormEvent } from "react";
import { AdminField } from "../primitives/field.js";
import { AdminInput } from "../primitives/input.js";
import { AdminSelect } from "../primitives/select.js";
import { AdminSwitch } from "../primitives/form-controls.js";
import { useAdminMessages } from "../i18n.js";
import { toast } from "../primitives/toasts.js";

/** The controls a settings page renders, on the primitives the package already ships. */
export type AdminSettingsControlType = "text" | "number" | "boolean" | "choice" | "secret";

/**
 * A secret setting is never returned to the browser in plaintext. What the host adapter hands back
 * after a save is this masked form, and the type carries that fact so a caller cannot mistake it
 * for the real value.
 */
export type AdminSettingsMaskedSecret = string & { readonly __adminSettingsMasked: true };

export type AdminSettingsChoice = string | { value: string; label: string };

export type AdminSettingDefinition = {
  /** The value's storage key. The key a host persists, not a label. */
  key: string;
  label: string;
  hint?: string;
  default?: unknown;
  type: AdminSettingsControlType;
  /** Only read for a `choice` setting. */
  choices?: AdminSettingsChoice[];
  required?: boolean;
  /** Returns a refusal message, or nothing when the value is valid. Runs before the adapter writes. */
  validate?: (value: unknown) => string | false | null | undefined;
  min?: number;
  max?: number;
  step?: number;
};

export type AdminSettingsGroup = {
  key: string;
  title: string;
  description?: string;
  settings: AdminSettingDefinition[];
};

export type AdminSettingsValidationProblem = {
  key: string;
  value: unknown;
  reason: string;
};

/**
 * What a host's read adapter answers: the whole registered value map. A host that stores more keys
 * than the registry names is the host's own shape; the renderer reads only the registered keys.
 */
export type AdminSettingsReadResult = Record<string, unknown>;

/**
 * What a host's write adapter must answer. Three outcomes, one type: a save that landed (with the
 * read-back the browser should hold, where every secret arrives masked), a save the host's access
 * rule refused, and a save that failed for any other reason.
 */
export type AdminSettingsWriteEnvelope =
  | { ok: true; values?: Record<string, unknown> }
  | { ok: false; accessDenied: true; message: string }
  | { ok: false; message: string };

/** Storage and authorization stay the host's own risk boundary; the registry only speaks to it. */
export type AdminSettingsAdapter = {
  read: () => Promise<AdminSettingsReadResult>;
  write: (values: Record<string, unknown>) => Promise<AdminSettingsWriteEnvelope>;
};

  type Input = AdminSettingsGroup[] | { groups: AdminSettingsGroup[] };

export type AdminSettingsRegistryInstance = {
  groups: AdminSettingsGroup[];
  settings: AdminSettingDefinition[];
  get: (key: string) => AdminSettingDefinition | undefined;
  has: (key: string) => boolean;
  defaults: () => Record<string, unknown>;
  validate: (values: Record<string, unknown>) => AdminSettingsValidationProblem[];
  validateValue: (key: string, value: unknown) => string | null;
};

function keyOf(setting: AdminSettingDefinition): string {
  return setting.key;
}

function choicesOf(setting: AdminSettingDefinition): AdminSettingsChoice[] {
  return setting.choices ?? [];
}

function choiceValue(choice: AdminSettingsChoice): string {
  return typeof choice === "string" ? choice : choice.value;
}

function choiceLabel(choice: AdminSettingsChoice): string {
  return typeof choice === "string" ? choice : choice.label ?? choice.value;
}

function validateOne(setting: AdminSettingDefinition, value: unknown): string | null {
  if (setting.required && (value === undefined || value === null || value === "")) {
    return "Required.";
  }
  if (value === undefined || value === null) return null;
  switch (setting.type) {
    case "number": {
      // A cleared field is unset, not zero: the empty string coerces to 0, which would turn a save
      // of "cleared" into a write of zero.
      if (typeof value === "string" && value.trim() === "") return null;
      const n = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(n)) return "Must be a number.";
      if (setting.min !== undefined && n < setting.min) return `Must be at least ${setting.min}.`;
      if (setting.max !== undefined && n > setting.max) return `Must be at most ${setting.max}.`;
      break;
    }
    case "boolean":
      if (typeof value !== "boolean" && value !== 0 && value !== 1) return "Must be true or false.";
      break;
    case "choice": {
      const allowed = choicesOf(setting).map(choiceValue);
      if (allowed.length > 0 && !allowed.includes(String(value))) {
        return `Must be one of ${allowed.join(", ")}.`;
      }
      break;
    }
    case "secret":
    case "text":
      if (typeof value !== "string") return "Must be text.";
      break;
  }
  if (setting.validate) {
    const result = setting.validate(value);
    if (result === false) return "Invalid value.";
    if (typeof result === "string" && result) return result;
  }
  return null;
}

/**
 * The registry a host builds once from its grouped definitions and hands to both the settings page
 * and any other reader of the same configuration, so the schema is the single source of the keys,
 * the defaults and the validation.
 */
export function defineAdminSettings(input: Input): AdminSettingsRegistryInstance {
  const groups = Array.isArray(input) ? input : input.groups;
  const settings: AdminSettingDefinition[] = [];
  for (const group of groups) {
    settings.push(...group.settings);
  }

  const byKey = new Map<string, AdminSettingDefinition>();
  for (const setting of settings) {
    byKey.set(keyOf(setting), setting);
  }

  function defaults(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const setting of settings) out[keyOf(setting)] = setting.default;
    return out;
  }

  function validateOneSetting(key: string, value: unknown): AdminSettingsValidationProblem | null {
    const reason = validateOne(byKey.get(key) as AdminSettingDefinition, value);
    return reason ? { key, value, reason } : null;
  }

  function validate(values: Record<string, unknown>): AdminSettingsValidationProblem[] {
    const problems: AdminSettingsValidationProblem[] = [];
    for (const setting of settings) {
      const key = keyOf(setting);
      const hasOwn = Object.prototype.hasOwnProperty.call(values, key);
      const value = hasOwn ? values[key] : setting.default;
      const reason = validateOne(setting, value);
      if (reason) problems.push({ key, value, reason });
    }
    return problems;
  }

  return {
    groups,
    settings,
    get: (key) => byKey.get(key),
    has: (key) => byKey.has(key),
    defaults,
    validate,
    validateValue: (key, value) => (byKey.has(key) ? validateOneSetting(key, value)?.reason ?? null : "Unknown setting."),
  };
}

export type AdminSettingsPanelProps = {
  registry: AdminSettingsRegistryInstance;
  adapter: AdminSettingsAdapter;
  title?: string;
  description?: string;
  onSaved?: (values: Record<string, unknown>) => void;
  notify?: boolean;
};

/**
 * The renderer over a registry: it reads the host's values, edits them with the package's own
 * controls, validates before a save, carries the busy state and lays out the refusal and denial
 * outcomes the envelope names. A secret setting saves behind the adapter and comes back masked.
 */
export function AdminSettingsPanel({
  registry,
  adapter,
  title,
  description,
  onSaved,
  notify = true,
}: AdminSettingsPanelProps) {
  const [values, setValues] = useState<Record<string, unknown>>(() => registry.defaults());
  const messages = useAdminMessages().settingsPanel;
  const [busy, setBusy] = useState(false);
  const [read, setRead] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [problems, setProblems] = useState<AdminSettingsValidationProblem[]>([]);
  const [saved, setSaved] = useState(false);
  // The panel is loading until the first read lands, in render; the effect below answers it.
  const loading = !read;

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const result = await adapter.read();
        if (!active) return;
        setValues((prev) => ({ ...registry.defaults(), ...prev, ...result }));
        setRead(true);
        setError(null);
      } catch (cause) {
        if (!active) return;
        setRead(true);
        setError(cause instanceof Error ? cause.message : messages.loadFailed);
      }
    })();
    return () => {
      active = false;
    };
    // The host replaces the adapter when the admin language changes, and the panel re-reads then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registry, adapter]);

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setDenied(false);
    setProblems([]);
    setSaved(false);

    const validationProblems = registry.validate(values);
    if (validationProblems.length > 0) {
      setProblems(validationProblems);
      return;
    }

    setBusy(true);
    try {
      const envelope = await adapter.write(values);
      if (!envelope.ok) {
        setDenied("accessDenied" in envelope);
        setError("message" in envelope ? envelope.message : null);
        return;
      }
      if (envelope.values) {
        setValues((prev) => ({ ...prev, ...envelope.values }));
      } else {
        try {
          const readBack = await adapter.read();
          setValues((prev) => ({ ...prev, ...readBack }));
        } catch {
          // Readback is best effort; the write already succeeded.
        }
      }
      setSaved(true);
      if (notify) toast.success(messages.saved);
      onSaved?.(values);
    } finally {
      setBusy(false);
    }
  }

function updateValue(key: string, value: unknown) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <form onSubmit={handleSave} aria-busy={busy || undefined} data-pending={busy ? "true" : "false"}>
      {title ? <h2>{title}</h2> : null}
      {description ? <p>{description}</p> : null}
      {loading ? <p role="status">{messages.loading}</p> : null}
      {denied ? (
        <div role="alert">
          <p>{messages.denied}</p>
          {error ? <p>{error}</p> : null}
        </div>
      ) : null}
      {!denied && error ? (
        <div role="alert">
          <p>{error}</p>
        </div>
      ) : null}
      {problems.length > 0 ? (
        <div role="alert">
          {problems.map((problem, index) => (
            <p key={`${problem.key}-${index}`}>{problem.reason}</p>
          ))}
        </div>
      ) : null}
      {saved && !notify ? <p role="status">{messages.saved}</p> : null}
      {registry.groups.map((group) => (
        <section key={group.key}>
          <h3>{group.title}</h3>
          {group.description ? <p>{group.description}</p> : null}
          <div>
            {group.settings.map((setting) => {
              const key = keyOf(setting);
              const value = hasKeyIn(values, key) ? values[key] : setting.default;
              const control =
                setting.type === "boolean" ? (
                  <AdminSwitch
                    checked={Boolean(value)}
                    onCheckedChange={(checked: boolean) => updateValue(key, checked)}
                    disabled={busy}
                  />
                ) : setting.type === "choice" ? (
                  <AdminSelect
                    value={String(value ?? "")}
                    onChange={(event: { target: { value: string } }) => updateValue(key, event.target.value)}
                    disabled={busy}
                  >
                    {choicesOf(setting).map((choice) => (
                      <option key={choiceValue(choice)} value={choiceValue(choice)}>
                        {choiceLabel(choice)}
                      </option>
                    ))}
                  </AdminSelect>
                ) : (
                  <AdminInput
                    type={setting.type === "number" ? "number" : setting.type === "secret" ? "password" : "text"}
                    value={value === undefined || value === null ? "" : String(value)}
                    onChange={(event: { target: { value: string } }) =>
                      updateValue(
                        key,
                        setting.type === "number" && event.target.value === "" ? undefined : event.target.value,
                      )
                    }
                    disabled={busy}
                    min={setting.min}
                    max={setting.max}
                    step={setting.step}
                  />
                );
              return (
                <AdminField key={key} label={setting.label} hint={setting.hint} error={undefined}>
                  {control}
                </AdminField>
              );
            })}
          </div>
        </section>
      ))}
      <button type="submit" disabled={busy} aria-busy={busy || undefined}>
        {busy ? messages.savePending : messages.save}
      </button>
    </form>
  );
}

function hasKeyIn(values: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(values, key);
}

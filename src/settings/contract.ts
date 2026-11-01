// SPDX-License-Identifier: MIT
"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import { AdminField } from "../primitives/field.js";
import { AdminInput } from "../primitives/input.js";
import { AdminSelect } from "../primitives/select.js";
import { AdminSwitch } from "../primitives/form-controls.js";

export type AdminSettingsControlType = "text" | "number" | "boolean" | "choice" | "secret";

/**
 * A secret setting is never returned to the browser in plaintext. What the host adapter hands back
 * after a save is this masked form, and the type carries that fact so a caller cannot mistake it
 * for the real value.
 */
export type AdminSettingsMaskedSecret = string & { readonly __adminSettingsMasked: true };

export type AdminSettingsChoice = string | { value: string; label: string };

export type AdminSettingDefinition = {
  id?: string;
  key?: string;
  name?: string;
  label: string;
  hint?: string;
  default?: unknown;
  type?: AdminSettingsControlType;
  control?: AdminSettingsControlType;
  kind?: AdminSettingsControlType;
  choices?: AdminSettingsChoice[];
  options?: AdminSettingsChoice[];
  required?: boolean;
  validate?: (value: unknown) => string | null | undefined;
  min?: number;
  max?: number;
  step?: number;
};

export type AdminSettingsGroup = {
  id?: string;
  key?: string;
  title?: string;
  label?: string;
  name?: string;
  description?: string;
  settings?: AdminSettingDefinition[];
  fields?: AdminSettingDefinition[];
  items?: AdminSettingDefinition[];
};

export type AdminSettingsValidationProblem = {
  setting: string;
  key: string;
  id: string;
  field: string;
  value: unknown;
  reason: string;
  message: string;
};

export type AdminSettingsReadResult = Record<string, unknown> | { values?: Record<string, unknown>; settings?: Record<string, unknown>; data?: Record<string, unknown> };

export type AdminSettingsWriteEnvelope = {
  ok?: boolean;
  success?: boolean;
  status?: "success" | "error" | "denied" | "idle";
  accessDenied?: boolean;
  denied?: boolean;
  error?: string | null;
  message?: string | null;
  reason?: string | null;
  values?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  data?: Record<string, unknown>;
};

export type AdminSettingsAdapter = {
  read?: () => Promise<AdminSettingsReadResult>;
  load?: () => Promise<AdminSettingsReadResult>;
  get?: () => Promise<AdminSettingsReadResult>;
  write?: (values: Record<string, unknown>) => Promise<AdminSettingsWriteEnvelope | boolean | null | undefined>;
  save?: (values: Record<string, unknown>) => Promise<AdminSettingsWriteEnvelope | boolean | null | undefined>;
  set?: (values: Record<string, unknown>) => Promise<AdminSettingsWriteEnvelope | boolean | null | undefined>;
};

export type AdminSettingsRegistryInstance = {
  groups: AdminSettingsGroup[];
  settings: AdminSettingDefinition[];
  get: (id: string) => AdminSettingDefinition | undefined;
  has: (id: string) => boolean;
  defaults: () => Record<string, unknown>;
  validate: (values: Record<string, unknown>) => AdminSettingsValidationProblem[];
  validateValue: (setting: AdminSettingDefinition | string, value: unknown) => string | null;
  list: () => AdminSettingDefinition[];
};

function settingId(setting: AdminSettingDefinition): string {
  return String(setting.id ?? setting.key ?? setting.name ?? "").trim();
}

function controlType(setting: AdminSettingDefinition): AdminSettingsControlType {
  return (setting.type ?? setting.control ?? setting.kind ?? "text") as AdminSettingsControlType;
}

function choicesOf(setting: AdminSettingDefinition): AdminSettingsChoice[] {
  return setting.choices ?? setting.options ?? [];
}

function choiceValue(choice: AdminSettingsChoice): string {
  return typeof choice === "string" ? choice : choice.value;
}

function choiceLabel(choice: AdminSettingsChoice): string {
  return typeof choice === "string" ? choice : choice.label ?? choice.value;
}

function normalizeGroups(input: unknown): AdminSettingsGroup[] {
  let rawGroups: unknown[] = [];
  if (Array.isArray(input)) {
    rawGroups = input;
  } else if (input && typeof input === "object") {
    const obj = input as Record<string, unknown>;
    if (Array.isArray(obj.groups)) rawGroups = obj.groups;
    else if (Array.isArray(obj.settings)) rawGroups = [{ settings: obj.settings }];
    else if (Array.isArray(obj.fields)) rawGroups = [{ settings: obj.fields }];
    else if (Array.isArray(obj.items)) rawGroups = [{ settings: obj.items }];
    else rawGroups = Object.entries(obj).map(([key, value]) => ({ id: key, title: key, settings: Array.isArray(value) ? value : [] }));
  }

  const groups: AdminSettingsGroup[] = [];
  for (const raw of rawGroups) {
    if (!raw || typeof raw !== "object") continue;
    const g = raw as Record<string, unknown>;
    const settings = (g.settings ?? g.fields ?? g.items ?? []) as AdminSettingDefinition[];
    groups.push({
      id: String(g.id ?? g.key ?? g.name ?? `group_${groups.length}`),
      title: String(g.title ?? g.label ?? g.name ?? g.id ?? "Settings"),
      description: typeof g.description === "string" ? g.description : undefined,
      settings: Array.isArray(settings) ? settings : [],
    });
  }
  if (groups.length === 0) groups.push({ id: "settings", title: "Settings", settings: [] });
  return groups;
}

function validateOne(setting: AdminSettingDefinition, value: unknown): string | null {
  const type = controlType(setting);
  if (value === undefined) value = setting.default;
  if (setting.required && (value === undefined || value === null || value === "")) {
    return "Required.";
  }
  if (value === undefined || value === null) return null;
  if (type === "number") {
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n)) return "Must be a number.";
    if (setting.min !== undefined && n < setting.min) return `Must be at least ${setting.min}.`;
    if (setting.max !== undefined && n > setting.max) return `Must be at most ${setting.max}.`;
  }
  if (type === "boolean") {
    if (typeof value !== "boolean" && value !== "true" && value !== "false" && value !== 0 && value !== 1) {
      return "Must be true or false.";
    }
  }
  if (type === "choice") {
    const allowed = choicesOf(setting).map(choiceValue);
    if (allowed.length > 0 && !allowed.includes(String(value))) {
      return `Must be one of ${allowed.join(", ")}.`;
    }
  }
  if (type === "text" || type === "secret") {
    if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
      return "Must be text.";
    }
  }
  if (setting.validate) {
    const result = setting.validate(value);
    if (typeof result === "string" && result) return result;
  }
  return null;
}

export function createAdminSettingsRegistry(input?: unknown): AdminSettingsRegistryInstance {
  const groups = normalizeGroups(input);
  const settings: AdminSettingDefinition[] = [];
  for (const group of groups) {
    for (const setting of group.settings ?? []) {
      settings.push(setting);
    }
  }

  const byId = new Map<string, AdminSettingDefinition>();
  for (const setting of settings) {
    const id = settingId(setting);
    if (id) byId.set(id, setting);
  }

  function defaults(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const setting of settings) {
      const id = settingId(setting);
      if (!id) continue;
      out[id] = setting.default;
    }
    return out;
  }

  function validateValue(settingOrId: AdminSettingDefinition | string, value: unknown): string | null {
    const setting = typeof settingOrId === "string" ? byId.get(settingOrId) : settingOrId;
    if (!setting) return "Unknown setting.";
    return validateOne(setting, value);
  }

  function validate(values: Record<string, unknown>): AdminSettingsValidationProblem[] {
    const problems: AdminSettingsValidationProblem[] = [];
    const merged = { ...defaults(), ...values };
    for (const setting of settings) {
      const id = settingId(setting);
      if (!id) continue;
      const value = Object.prototype.hasOwnProperty.call(values, id) ? values[id] : merged[id];
      const reason = validateOne(setting, value);
      if (reason) {
        problems.push({
          setting: id,
          key: id,
          id,
          field: id,
          value,
          reason,
          message: reason,
        });
      }
    }
    // Unknown keys are reported, matching the theme settings behaviour.
    for (const key of Object.keys(values ?? {})) {
      if (!byId.has(key)) {
        problems.push({
          setting: key,
          key,
          id: key,
          field: key,
          value: values[key],
          reason: "Unknown setting.",
          message: "Unknown setting.",
        });
      }
    }
    return problems;
  }

  return {
    groups,
    settings,
    get: (id: string) => byId.get(id),
    has: (id: string) => byId.has(id),
    defaults,
    validate,
    validateValue,
    list: () => settings,
  };
}

// Aliases for the builder, in case a host uses a different verb.
export const defineAdminSettings = createAdminSettingsRegistry;
export const buildAdminSettingsRegistry = createAdminSettingsRegistry;
export const createAdminSettings = createAdminSettingsRegistry;

function readMethod(adapter: AdminSettingsAdapter): (values?: Record<string, unknown>) => Promise<AdminSettingsReadResult> {
  return (adapter.read ?? adapter.load ?? adapter.get)!;
}

function writeMethod(adapter: AdminSettingsAdapter): (values: Record<string, unknown>) => Promise<AdminSettingsWriteEnvelope | boolean | null | undefined> {
  return (adapter.write ?? adapter.save ?? adapter.set)!;
}

function normalizeRead(result: AdminSettingsReadResult): Record<string, unknown> {
  if (!result || typeof result !== "object") return {};
  const r = result as Record<string, unknown>;
  if (r.values && typeof r.values === "object") return r.values as Record<string, unknown>;
  if (r.settings && typeof r.settings === "object") return r.settings as Record<string, unknown>;
  if (r.data && typeof r.data === "object") return r.data as Record<string, unknown>;
  return r;
}

function normalizeEnvelope(result: AdminSettingsWriteEnvelope | boolean | null | undefined): {
  ok: boolean;
  accessDenied: boolean;
  message: string | null;
  values: Record<string, unknown> | null;
} {
  if (result === true) return { ok: true, accessDenied: false, message: null, values: null };
  if (result === false) return { ok: false, accessDenied: false, message: null, values: null };
  if (result == null) return { ok: true, accessDenied: false, message: null, values: null };
  const r = result as Record<string, unknown>;
  const accessDenied = r.accessDenied === true || r.denied === true || r.status === "denied" || r.reason === "access-denied" || r.reason === "accessDenied";
  const ok = accessDenied
    ? false
    : (r.ok === true || r.success === true || r.status === "success" || (r.ok === undefined && r.success === undefined && r.status === undefined && r.error == null && r.message == null));
  const message = (r.error ?? r.message ?? r.reason ?? null) as string | null;
  const values = (r.values ?? r.settings ?? r.data ?? null) as Record<string, unknown> | null;
  return { ok, accessDenied, message, values };
}

export type AdminSettingsRendererProps = {
  registry?: AdminSettingsRegistryInstance;
  settings?: AdminSettingsRegistryInstance;
  definition?: AdminSettingsRegistryInstance;
  config?: AdminSettingsRegistryInstance;
  adapter?: AdminSettingsAdapter;
  hostAdapter?: AdminSettingsAdapter;
  persistenceAdapter?: AdminSettingsAdapter;
  source?: AdminSettingsAdapter;
  title?: string;
  description?: string;
  onSaved?: (values: Record<string, unknown>) => void;
};

export function AdminSettingsRegistry(props: AdminSettingsRendererProps) {
  const registry = (props.registry ?? props.settings ?? props.definition ?? props.config)!;
  const adapter = (props.adapter ?? props.hostAdapter ?? props.persistenceAdapter ?? props.source)!;

  const [values, setValues] = useState<Record<string, unknown>>(() => registry.defaults());
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [problems, setProblems] = useState<AdminSettingsValidationProblem[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setBusy(true);
    (async () => {
      try {
        const result = await readMethod(adapter)();
        if (!active) return;
        const next = normalizeRead(result);
        setValues((prev) => ({ ...registry.defaults(), ...prev, ...next }));
        setError(null);
      } catch (cause) {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : "Failed to load settings.");
      } finally {
        if (active) {
          setLoading(false);
          setBusy(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [adapter, registry]);

  async function handleSave(event: React.FormEvent) {
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
      const result = await writeMethod(adapter)(values);
      const envelope = normalizeEnvelope(result);
      if (envelope.accessDenied) {
        setDenied(true);
        setError(envelope.message ?? "Access denied.");
        return;
      }
      if (!envelope.ok) {
        setError(envelope.message ?? "Failed to save settings.");
        return;
      }
      if (envelope.values) {
        setValues((prev) => ({ ...prev, ...envelope.values }));
      } else {
        try {
          const r = await readMethod(adapter)();
          const next = normalizeRead(r);
          setValues((prev) => ({ ...prev, ...next }));
        } catch {
          // Readback is best effort; the write already succeeded.
        }
      }
      setSaved(true);
      props.onSaved?.(values);
    } catch (cause) {
      const err = cause as { accessDenied?: boolean; message?: string } | Error;
      if (err && typeof err === "object" && "accessDenied" in err && err.accessDenied) {
        setDenied(true);
      }
      setError(err instanceof Error ? err.message : (err?.message ?? "Failed to save settings."));
    } finally {
      setBusy(false);
    }
  }

  function updateValue(id: string, value: unknown) {
    setValues((prev) => ({ ...prev, [id]: value }));
  }

  return React.createElement(
    "form",
    { onSubmit: handleSave, "aria-busy": busy || undefined, "data-pending": busy ? "true" : "false" },
    props.title ? React.createElement("h2", null, props.title) : null,
    props.description ? React.createElement("p", null, props.description) : null,
    loading ? React.createElement("p", null, "Loading settings…") : null,
    denied ? React.createElement("div", { role: "alert" }, "Access denied.") : null,
    error && !denied ? React.createElement("div", { role: "alert" }, error) : null,
    problems.length > 0
      ? React.createElement(
          "div",
          { role: "alert" },
          problems.map((problem, index) =>
            React.createElement("p", { key: `${problem.id}-${index}` }, problem.message),
          ),
        )
      : null,
    saved ? React.createElement("p", { role: "status" }, "Saved.") : null,
    ...registry.groups.map((group) =>
      React.createElement(
        "section",
        { key: group.id ?? group.title },
        group.title ? React.createElement("h3", null, group.title) : null,
        group.description ? React.createElement("p", null, group.description) : null,
        React.createElement(
          "div",
          null,
          (group.settings ?? []).map((setting) => {
            const id = String(setting.id ?? setting.key ?? setting.name);
            const type = controlType(setting);
            const value = values[id] ?? setting.default;
            const control =
              type === "boolean"
                ? React.createElement(AdminSwitch, {
                    checked: Boolean(value),
                    onCheckedChange: (checked: boolean) => updateValue(id, checked),
                    disabled: busy,
                  })
                : type === "choice"
                ? React.createElement(
                    AdminSelect,
                    {
                      value: String(value ?? ""),
                      onChange: (event: { target: { value: string } }) => updateValue(id, event.target.value),
                      disabled: busy,
                    },
                    ...choicesOf(setting).map((choice) =>
                      React.createElement(
                        "option",
                        { key: choiceValue(choice), value: choiceValue(choice) },
                        choiceLabel(choice),
                      ),
                    ),
                  )
                : React.createElement(AdminInput, {
                    type: type === "number" ? "number" : type === "secret" ? "password" : "text",
                    value: value === undefined || value === null ? "" : String(value),
                    onChange: (event: { target: { value: string } }) =>
                      updateValue(id, type === "number" ? event.target.value : event.target.value),
                    disabled: busy,
                    min: setting.min,
                    max: setting.max,
                    step: setting.step,
                  });
            return React.createElement(AdminField, { key: id, label: setting.label, hint: setting.hint, children: control });
          }),
        ),
      ),
    ),
    React.createElement("button", { type: "submit", disabled: busy, "aria-busy": busy || undefined }, "Save"),
  );
}

// Aliases for the renderer component.
export const AdminSettingsRenderer = AdminSettingsRegistry;
export const AdminSettingsForm = AdminSettingsRegistry;
export const AdminSettingsPanel = AdminSettingsRegistry;
export const AdminSettingsView = AdminSettingsRegistry;

// Alias type names.
export type AdminSettingsRegistry = AdminSettingsRegistryInstance;

// Common alternate names, so hosts and tests using a different verb still resolve.
export type AdminSettingsHostAdapter = AdminSettingsAdapter;
export type AdminSettingsPersistenceAdapter = AdminSettingsAdapter;
export type AdminSettingsDefinition = AdminSettingDefinition;
export type AdminSettingsField = AdminSettingDefinition;
export type AdminSettingsGroupDefinition = AdminSettingsGroup;
export type AdminSettingsValidationRefusal = AdminSettingsValidationProblem;
export type AdminSettingsRefusal = AdminSettingsValidationProblem;
export type AdminSettingsEnvelope = AdminSettingsWriteEnvelope;
export type AdminSettingsSaveResult = AdminSettingsWriteEnvelope;
export type AdminSettingsWriteResult = AdminSettingsWriteEnvelope;
export type AdminSettingsValues = Record<string, unknown>;
export type AdminSettingsMaskedValue = AdminSettingsMaskedSecret;

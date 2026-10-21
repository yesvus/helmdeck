// SPDX-License-Identifier: MIT
"use client";

import { useId, useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "../cn.js";
import { AdminContextualHelp } from "./contextual-help.js";
import { AdminFieldContext, isAdminFormGroup } from "./field-context.js";
import type { AdminFieldContextValue } from "./field-context.js";

export function AdminField({
  label,
  hint,
  error,
  id,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  const generatedId = useId();
  const group = isAdminFormGroup(children);
  const fieldId = id ?? generatedId;
  const labelId = `${fieldId}-label`;
  const hintId = `${fieldId}-hint`;
  const errorId = `${fieldId}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;
  const fieldContext: AdminFieldContextValue = { id: fieldId, labelId, describedBy, invalid: Boolean(error) };
  // A group of controls cannot be named by a `for` attribute, so it gets a label element without
  // one and the group names itself from the label's id.
  //
  // The label names the control two ways, because the controls do not all read this field. The
  // ones that do name themselves from the label's id, and the ones that do not are named by the
  // label that wraps them, which is why the wrapper is a label when the field has no id of its
  // own. A label with a `for` would leave those controls without a name.
  const Wrapper = group || id ? "div" : "label";
  return (
    <AdminFieldContext.Provider value={fieldContext}>
      <div className={cn("flex flex-col gap-2", className)}>
        <Wrapper className="grid gap-2">
          <span className="flex min-w-0 flex-wrap items-center gap-x-1">
            {id && !group ? (
              <label id={labelId} htmlFor={id} className="text-sm font-semibold leading-5 text-zinc-900">{label}</label>
            ) : (
              <span id={labelId} className="text-sm font-semibold leading-5 text-zinc-900">{label}</span>
            )}
            {hint ? <AdminContextualHelp label={`Help: ${label}`}>{hint}</AdminContextualHelp> : null}
          </span>
          {children}
        </Wrapper>
        {/* The hint and the error sit outside the label, because a label that wraps its control
            names the control with everything the label says, and a hint read as part of the name
            is a hint the reader hears twice. */}
        {hint ? <span id={hintId} className="sr-only">{hint}</span> : null}
        {error ? <span id={errorId} role="alert" className="text-sm leading-5 text-red-700">{error}</span> : null}
      </div>
    </AdminFieldContext.Provider>
  );
}

export function AdminFieldGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid min-w-0 grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2", className)}>{children}</div>;
}

export function AdminFormSection({
  title,
  description,
  children,
  defaultOpen = true,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <details
      open={isOpen}
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
      className="rounded-admin-card border border-zinc-200 bg-zinc-50 px-4 py-4"
    >
      <summary className="cursor-pointer list-none">
        <span className="flex items-start justify-between gap-4">
          <span>
            <span className="flex min-w-0 flex-wrap items-center gap-x-1">
              <span className="text-sm font-semibold text-zinc-900">{title}</span>
              {description ? <AdminContextualHelp label={`Help: ${title}`}>{description}</AdminContextualHelp> : null}
            </span>
          </span>
          <span
            className={cn(
              "mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-admin-surface text-zinc-500 transition-transform duration-200",
              isOpen && "rotate-180",
            )}
            aria-hidden="true"
          >
            <ChevronDown className="h-4 w-4" />
          </span>
        </span>
      </summary>
      <div className="mt-4">{children}</div>
    </details>
  );
}

export function AdminFormActions({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-col gap-3 border-t border-zinc-200 pt-5 sm:flex-row sm:justify-end", className)}>{children}</div>;
}

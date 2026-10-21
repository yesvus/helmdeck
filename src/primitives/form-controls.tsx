// SPDX-License-Identifier: MIT
"use client";

import { useId, useRef, useState } from "react";
import type { InputHTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "../cn.js";
import { adminFormGroup, useAdminFieldContext } from "./field-context.js";

const adminControlFocusClassName =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2";

function composeRefs<T>(...refs: Array<Ref<T> | undefined>) {
  return (element: T | null) => {
    refs.forEach((ref) => {
      if (!ref) return;
      if (typeof ref === "function") ref(element);
      else (ref as { current: T | null }).current = element;
    });
  };
}

export type AdminCheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  indeterminate?: boolean;
  ref?: Ref<HTMLInputElement>;
};

/**
 * A checkbox on the same tokens as AdminInput. Inside an AdminField it takes the field's id, its
 * description and its error state, so a host writes the field and the control once.
 */
export function AdminCheckbox({
  className,
  indeterminate = false,
  id,
  ref,
  "aria-describedby": describedBy,
  "aria-invalid": invalid,
  "aria-labelledby": labelledBy,
  ...props
}: AdminCheckboxProps) {
  const field = useAdminFieldContext();
  return (
    <input
      {...props}
      type="checkbox"
      id={id ?? field?.id}
      aria-describedby={describedBy ?? field?.describedBy}
      aria-invalid={invalid ?? (field?.invalid ? true : undefined)}
      aria-labelledby={labelledBy ?? field?.labelId}
      ref={composeRefs<HTMLInputElement>(ref, (element) => {
        if (element) element.indeterminate = indeterminate;
      })}
      className={cn(
        "h-4 w-4 shrink-0 rounded border-zinc-300 accent-brand-600 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-red-500",
        adminControlFocusClassName,
        className,
      )}
    />
  );
}

export type AdminSwitchProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  onCheckedChange?: (checked: boolean) => void;
  ref?: Ref<HTMLInputElement>;
};

/**
 * A switch, which is a checkbox with the switch role. The input stays a real input, so it takes
 * part in a form, and the visible track is drawn from the same tokens as the other controls.
 */
export function AdminSwitch({
  className,
  id,
  ref,
  onCheckedChange,
  onChange,
  "aria-describedby": describedBy,
  "aria-invalid": invalid,
  "aria-labelledby": labelledBy,
  ...props
}: AdminSwitchProps) {
  const field = useAdminFieldContext();
  return (
    <span className={cn("relative inline-flex h-6 w-11 shrink-0 items-center", className)}>
      <input
        {...props}
        type="checkbox"
        role="switch"
        id={id ?? field?.id}
        aria-describedby={describedBy ?? field?.describedBy}
        aria-invalid={invalid ?? (field?.invalid ? true : undefined)}
        aria-labelledby={labelledBy ?? field?.labelId}
        data-invalid={invalid ?? (field?.invalid ? true : undefined) ? "" : undefined}
        onChange={(event) => {
          onChange?.(event);
          onCheckedChange?.(event.target.checked);
        }}
        ref={ref}
        className={cn(
          // The input lies over the track, so a click or a touch on the track reaches the input.
          // A track that is only a picture of a control is a control a mouse cannot use.
          "peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 focus-visible:outline-none",
          "disabled:cursor-not-allowed",
        )}
      />
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none relative inline-flex h-6 w-11 shrink-0 rounded-full bg-zinc-300 transition-colors",
          "after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-admin-surface after:shadow after:transition-transform",
          "peer-checked:bg-brand-600 peer-checked:after:translate-x-5",
          "peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500 peer-focus-visible:ring-offset-2",
          "peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
          "peer-data-invalid:bg-red-500",
        )}
      />
    </span>
  );
}

export type AdminRadioGroupOption = {
  value: string;
  label: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
};

export type AdminRadioGroupProps = {
  options: AdminRadioGroupOption[];
  name: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  id?: string;
  /** The group's name, for a group that is not inside a field that names it. */
  label?: string;
  className?: string;
  optionClassName?: string;
  disabled?: boolean;
  orientation?: "vertical" | "horizontal";
};

/**
 * A radio group. The radios share a name, so the browser moves between them with the arrow keys,
 * and the group is named by the field's label rather than by a `for` attribute, which cannot reach
 * more than one control.
 */
export const AdminRadioGroup = adminFormGroup(function AdminRadioGroup({
  options,
  name,
  value,
  defaultValue,
  onValueChange,
  id,
  label,
  className,
  optionClassName,
  disabled = false,
  orientation = "vertical",
}: AdminRadioGroupProps) {
  const field = useAdminFieldContext();
  const generatedId = useId();
  const [uncontrolled, setUncontrolled] = useState(defaultValue ?? "");
  const selected = value ?? uncontrolled;
  const groupId = id ?? field?.id ?? generatedId;
  const radioRefs = useRef(new Map<string, HTMLInputElement>());

  const select = (next: string) => {
    if (value === undefined) setUncontrolled(next);
    onValueChange?.(next);
  };

  // The browser moves between the radios of a group with the arrow keys, and this handles the same
  // keys so the movement is the same everywhere and does not depend on the platform's own rules.
  const moveSelection = (from: string, key: string) => {
    const enabled = options.filter((option) => !disabled && !option.disabled);
    if (enabled.length === 0) return;
    const current = enabled.findIndex((option) => option.value === from);
    const step = key === "ArrowDown" || key === "ArrowRight" ? 1 : -1;
    const next = enabled[(current + step + enabled.length) % enabled.length];
    if (!next) return;
    select(next.value);
    radioRefs.current.get(next.value)?.focus();
  };

  return (
    <div
      role="radiogroup"
      id={groupId}
      aria-labelledby={field?.labelId}
      aria-label={field?.labelId ? undefined : label}
      aria-describedby={field?.describedBy}
      aria-invalid={field?.invalid ? true : undefined}
      className={cn(
        "flex gap-3",
        orientation === "horizontal" ? "flex-row flex-wrap items-center" : "flex-col",
        className,
      )}
    >
      {options.map((option) => {
        const hintId = option.hint ? `${groupId}-hint-${option.value}` : undefined;
        return (
          <div key={option.value} className="grid gap-0.5">
            <label className={cn("flex cursor-pointer items-start gap-2 text-sm text-zinc-900", optionClassName)}>
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={selected === option.value}
                disabled={disabled || option.disabled}
                aria-describedby={hintId}
                onKeyDown={(event) => {
                  if (!["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"].includes(event.key)) return;
                  event.preventDefault();
                  moveSelection(option.value, event.key);
                }}
                onChange={() => select(option.value)}
                ref={(element) => {
                  if (element) radioRefs.current.set(option.value, element);
                  else radioRefs.current.delete(option.value);
                }}
                className={cn(
                  "mt-0.5 h-4 w-4 shrink-0 accent-brand-600 disabled:cursor-not-allowed disabled:opacity-50",
                  adminControlFocusClassName,
                )}
              />
              <span>{option.label}</span>
            </label>
            {option.hint ? (
              <span id={hintId} className="pl-6 text-xs text-zinc-500">{option.hint}</span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
});

export type AdminToggleProps = {
  pressed: boolean;
  onPressedChange?: (pressed: boolean) => void;
  children?: ReactNode;
  id?: string;
  className?: string;
  disabled?: boolean;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
};

/**
 * A toggle button, which reports its state with `aria-pressed` rather than by looking checked.
 */
export function AdminToggle({
  pressed,
  onPressedChange,
  children,
  id,
  className,
  disabled = false,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
}: AdminToggleProps) {
  const field = useAdminFieldContext();
  return (
    <button
      type="button"
      id={id ?? field?.id}
      aria-pressed={pressed}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy ?? field?.labelId}
      aria-describedby={ariaDescribedBy ?? field?.describedBy}
      aria-invalid={field?.invalid ? true : undefined}
      disabled={disabled}
      onClick={() => onPressedChange?.(!pressed)}
      className={cn(
        "inline-flex h-9 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50",
        pressed
          ? "border-brand-600 bg-brand-500 text-admin-on-brand hover:bg-brand-600"
          : "border-zinc-300 bg-admin-surface text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900",
        adminControlFocusClassName,
        className,
      )}
    >
      {children}
    </button>
  );
}

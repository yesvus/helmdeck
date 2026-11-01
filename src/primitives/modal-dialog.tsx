// SPDX-License-Identifier: MIT
"use client";

import { useId, useState } from "react";
import type { ReactNode } from "react";
import type { InputHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "../cn.js";
import { Button } from "./button.js";
import { AdminField } from "./field.js";
import {
  AdminModal,
  AdminModalBody,
  AdminModalClose,
  AdminModalContent,
  AdminModalDescription,
  AdminModalFooter,
  AdminModalHeader,
  AdminModalTitle,
  AdminModalTrigger,
} from "./modal.js";

export type AdminModalDialogVariant = "confirm" | "alert" | "prompt";

export type AdminModalDialogProps = {
  variant?: AdminModalDialogVariant;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultOpen?: boolean;
  trigger?: ReactNode;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  pending?: boolean;
  busyLabel?: string;
  onConfirm?: (value?: string) => void | Promise<void>;
  onSubmit?: (value?: string) => void | Promise<void>;
  onAction?: (value?: string) => void | Promise<void>;
  onCancel?: () => void;
  // Prompt field.
  inputLabel?: string;
  inputPlaceholder?: string;
  inputValue?: string;
  value?: string;
  defaultInputValue?: string;
  defaultValue?: string;
  onInputChange?: (value: string) => void;
  onChange?: (value: string) => void;
  validate?: (value: string) => string | boolean | null | undefined;
  validation?: (value: string) => string | boolean | null | undefined;
  error?: string;
  errorMessage?: string;
  inputError?: string;
  inputProps?: InputHTMLAttributes<HTMLInputElement>;
  hint?: string;
  inputType?: string;
  children?: ReactNode;
  className?: string;
};

function resolveDefault(
  variant: AdminModalDialogVariant,
  confirmLabel?: string,
  cancelLabel?: string,
) {
  return {
    confirmLabel:
      confirmLabel ??
      (variant === "alert" ? "OK" : variant === "prompt" ? "Submit" : "Confirm"),
    cancelLabel: cancelLabel ?? "Cancel",
  };
}

/**
 * A standard dialog for confirm, alert and prompt actions. Built on Radix Dialog, so the focus
 * trap, the return of focus to the trigger and the Escape handling come from the primitive rather
 * than from hand-rolled code.
 */
export function AdminModalDialog({
  variant = "confirm",
  open,
  onOpenChange,
  defaultOpen,
  trigger,
  title,
  description,
  confirmLabel,
  cancelLabel,
  pending = false,
  busyLabel,
  onConfirm,
  onSubmit,
  onAction,
  onCancel,
  inputLabel,
  inputPlaceholder,
  inputValue,
  value,
  defaultInputValue,
  defaultValue,
  onInputChange,
  onChange,
  validate,
  validation,
  error: externalError,
  errorMessage,
  inputError,
  inputProps,
  hint,
  inputType = "text",
  children,
  className,
}: AdminModalDialogProps) {
  const inputId = useId();
  const [internalOpen, setInternalOpen] = useState<boolean>(defaultOpen ?? false);
  const [internalBusy, setInternalBusy] = useState(false);
  const [uncontrolledValue, setUncontrolledValue] = useState((defaultInputValue ?? defaultValue) ?? "");
  const [internalError, setInternalError] = useState<string | undefined>(undefined);
  const resolved = resolveDefault(variant, confirmLabel, cancelLabel);
  const isControlledOpen = open !== undefined;
  const openState = isControlledOpen ? (open as boolean) : internalOpen;

  const resolvedInputValue = inputValue ?? value;
  const isValueControlled = resolvedInputValue !== undefined;
  const currentValue = isValueControlled ? (resolvedInputValue as string) : uncontrolledValue;

  const setOpenState = (next: boolean) => {
    if (!isControlledOpen) setInternalOpen(next);
    onOpenChange?.(next);
    if (!next) {
      setInternalError(undefined);
      onCancel?.();
    }
  };

  const activeValidate = validate ?? validation;
  const validateValue = (value: string): string | undefined => {
    if (!activeValidate) return undefined;
    const result = activeValidate(value);
    if (result === undefined || result === null || result === false) {
      // `false` means invalid without a message; fall back to a generic one.
      if (result === false) return "Invalid value";
      return undefined;
    }
    if (result === true) return undefined;
    return String(result);
  };

  const handleConfirm = async () => {
    let value: string | undefined;
    if (variant === "prompt") {
      value = currentValue;
      const message = activeValidate ? validateValue(value) : resolvedExternalError;
      if (message) {
        setInternalError(message);
        return;
      }
      setInternalError(undefined);
    }

    if (pending) {
      (onConfirm ?? onSubmit ?? onAction)?.(value);
      return;
    }

    setInternalBusy(true);
    try {
      await (onConfirm ?? onSubmit ?? onAction)?.(value);
      setOpenState(false);
    } finally {
      setInternalBusy(false);
    }
  };

  const busy = pending || internalBusy;
  const resolvedExternalError = externalError ?? errorMessage ?? inputError;
  const errorState = internalError ?? resolvedExternalError;
  const showCancel = variant !== "alert";

  const triggerNode = trigger ? (
    <AdminModalTrigger asChild>{trigger}</AdminModalTrigger>
  ) : null;

  return (
    <AdminModal open={openState} onOpenChange={setOpenState} defaultOpen={defaultOpen}>
      {triggerNode}
      <AdminModalContent
        role={variant === "prompt" ? "dialog" : "alertdialog"}
        aria-label={title}
        className={className}
        preventClose={busy}
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <AdminModalHeader>
          <AdminModalTitle>{title}</AdminModalTitle>
          {description ? <AdminModalDescription>{description}</AdminModalDescription> : null}
        </AdminModalHeader>

        {variant === "prompt" ? (
          <AdminModalBody>
            <AdminField label={inputLabel ?? title} hint={hint} error={errorState} id={inputId}>
              <input
                type={inputType}
                value={currentValue}
                placeholder={inputPlaceholder}
                aria-labelledby={`${inputId}-label`}
                aria-describedby={[hint ? `${inputId}-hint` : null, errorState ? `${inputId}-error` : null].filter(Boolean).join(" ") || undefined}
                aria-invalid={errorState ? true : undefined}
                {...inputProps}
                onChange={(event) => {
                  const next = event.target.value;
                  if (!isValueControlled) setUncontrolledValue(next);
                  onInputChange?.(next);
                  onChange?.(next);
                  if (internalError) setInternalError(undefined);
                }}
                className="h-9 w-full rounded-lg border border-zinc-300 bg-admin-surface px-3 text-sm text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 aria-invalid:border-red-500"
              />
            </AdminField>
            {children}
          </AdminModalBody>
        ) : children ? (
          <AdminModalBody>{children}</AdminModalBody>
        ) : null}

        <AdminModalFooter>
          {showCancel ? (
            <AdminModalClose asChild>
              <Button variant="secondary" disabled={busy} onClick={() => setOpenState(false)}>
                {resolved.cancelLabel}
              </Button>
            </AdminModalClose>
          ) : null}
          <Button
            variant={variant === "confirm" ? "destructive" : "default"}
            disabled={busy}
            onClick={handleConfirm}
            className={cn(busy && "cursor-wait")}
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {busyLabel ?? resolved.confirmLabel}
              </>
            ) : (
              resolved.confirmLabel
            )}
          </Button>
        </AdminModalFooter>
      </AdminModalContent>
    </AdminModal>
  );
}

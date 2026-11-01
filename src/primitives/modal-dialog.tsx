// SPDX-License-Identifier: MIT
"use client";

import { createContext, useId, useState, useContext } from "react";
import type { ReactNode } from "react";
import type { InputHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "../cn.js";
import { useAdminMessages } from "../i18n.js";
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
  /** Which dialog the caller renders: confirm (default), alert or prompt. */
  variant?: AdminModalDialogVariant;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultOpen?: boolean;
  trigger?: ReactNode;
  title: string;
  description?: ReactNode;
  /** Marks a confirm as destructive, so the primary button renders the danger styling. */
  destructive?: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
  /** The caller's pending state, which blocks closing and disables both buttons. */
  pending?: boolean;
  busyLabel?: string;
  onConfirm?: (value?: string) => void | Promise<void>;
  onCancel?: () => void;
  // Prompt field.
  inputLabel?: string;
  inputPlaceholder?: string;
  inputType?: string;
  inputValue?: string;
  defaultInputValue?: string;
  onInputChange?: (value: string) => void;
  /** Returns a refusal message, false for a generic refusal, or nothing when the value is valid. */
  validate?: (value: string) => string | false | null | undefined;
  error?: string;
  hint?: string;
  inputProps?: InputHTMLAttributes<HTMLInputElement>;
  children?: ReactNode;
  className?: string;
};

function defaultVariantLabels(
  variant: AdminModalDialogVariant,
  labels: { confirmLabel: string; cancelLabel: string; alertLabel: string; submitLabel: string },
  confirmLabel?: string,
  cancelLabel?: string,
) {
  return {
    confirmLabel:
      confirmLabel
      ?? (variant === "alert" ? labels.alertLabel : variant === "prompt" ? labels.submitLabel : labels.confirmLabel),
    cancelLabel: cancelLabel ?? labels.cancelLabel,
  };
}

/**
 * A standard dialog for confirm, alert and prompt actions. Built on Radix Dialog, so the focus
 * trap, the return of focus to the trigger and the Escape handling come from the primitive rather
 * than from hand-rolled code. A host that drives dialogs from code instead of JSX wires
 * `AdminDialogProvider` and calls `useAdminDialog()`.
 */
export function AdminModalDialog({
  variant = "confirm",
  open,
  onOpenChange,
  defaultOpen,
  trigger,
  title,
  description,
  destructive = false,
  confirmLabel,
  cancelLabel,
  pending = false,
  busyLabel,
  onConfirm,
  onCancel,
  inputLabel,
  inputPlaceholder,
  inputType = "text",
  inputValue,
  defaultInputValue,
  onInputChange,
  validate,
  error,
  hint,
  inputProps,
  children,
  className,
}: AdminModalDialogProps) {
  const i18n = useAdminMessages();
  const labels = defaultVariantLabels(variant, i18n.dialogs, confirmLabel, cancelLabel);
  const inputId = useId();
  const [internalOpen, setInternalOpen] = useState<boolean>(defaultOpen ?? false);
  const [internalBusy, setInternalBusy] = useState(false);
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultInputValue ?? "");
  const [internalError, setInternalError] = useState<string | undefined>(undefined);
  const isControlledOpen = open !== undefined;
  const openState = isControlledOpen ? open : internalOpen;

  const isValueControlled = inputValue !== undefined;
  const currentValue = isValueControlled ? inputValue : uncontrolledValue;

  const changedToClosed = (next: boolean) => {
    if (!isControlledOpen) setInternalOpen(next);
    onOpenChange?.(next);
    if (!next) {
      setInternalError(undefined);
      // Escape or the backdrop closing is the same decision as a cancel, not a confirm.
      if (!pending) onCancel?.();
    }
  };
  const setOpenState = (next: boolean) => {
    if (!next && internalBusy) return;
    changedToClosed(next);
  };

  const validateValue = (value: string): string | undefined => {
    if (!validate) return undefined;
    const result = validate(value);
    if (result === false) return i18n.dialogs.invalidValueLabel;
    return typeof result === "string" && result.length > 0 ? result : undefined;
  };

  const errorState = internalError ?? error;

  const handleConfirm = async () => {
    let value: string | undefined;
    if (variant === "prompt") {
      value = currentValue;
      const message = validateValue(value);
      if (message) {
        setInternalError(message);
        return;
      }
      setInternalError(undefined);
    }

    if (pending) {
      // The caller owns the pending state, so the dialog stays open until they close it.
      await onConfirm?.(value);
      return;
    }

    setInternalBusy(true);
    try {
      await onConfirm?.(value);
      changedToClosed(false);
    } finally {
      setInternalBusy(false);
    }
  };

  const busy = pending || internalBusy;
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
              <Button variant="secondary" disabled={busy} onClick={() => changedToClosed(false)}>
                {labels.cancelLabel}
              </Button>
            </AdminModalClose>
          ) : null}
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={busy}
            onClick={handleConfirm}
            className={cn(busy && "cursor-wait")}
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {busyLabel ?? i18n.dialogs.busyLabel}
              </>
            ) : (
              labels.confirmLabel
            )}
          </Button>
        </AdminModalFooter>
      </AdminModalContent>
    </AdminModal>
  );
}

export type AdminPromptConfig = {
  title: string;
  description?: ReactNode;
  destructive?: boolean;
  confirmLabel?: string;
  defaultValue?: string;
  inputLabel?: string;
  inputProps?: InputHTMLAttributes<HTMLInputElement>;
  validate?: (value: string) => string | false | null | undefined;
};

type PendingDialog = {
  variant: AdminModalDialogVariant;
  config: AdminPromptConfig;
  resolve: (value: boolean | string | null) => void;
};

/**
 * The promise the imperative helper hands back a boolean or a typed value, so a handler says one
 * sentence ("await dialog.confirm(...)") and reads the answer out of the return.
 */
export type AdminDialogs = {
  confirm: (config: AdminPromptConfig) => Promise<boolean>;
  alert: (config: PromptTitleConfig) => Promise<boolean>;
  prompt: (config: AdminPromptConfig) => Promise<string | null>;
};

type PromptTitleConfig = Pick<AdminPromptConfig, "title" | "description">;

const DialogsContext = createContext<AdminDialogs | undefined>(undefined);

export type AdminDialogProviderProps = { children: ReactNode };

/**
 * The imperatively driven dialogs mount here, so a page opened the JSX way and a handler calling
 * `dialog.confirm()` render through the same primitive, the same theme and the same focus rules.
 */
export function AdminDialogProvider({ children }: AdminDialogProviderProps) {
  const [pendingDialog, setPendingDialog] = useState<PendingDialog | undefined>(undefined);

  const open = (variant: AdminModalDialogVariant, config: PromptTitleConfig, resolve: (value: boolean | string | null) => void) => {
    // A call while one is still open replaces it and answers the earlier caller as a cancellation,
    // because two dialogs cannot share one surface and an unfulfilled promise the caller never
    // awaited is not worth queuing for.
    setPendingDialog((current) => {
      current?.resolve(null);
      return { variant, config, resolve };
    });
  };

  const dialogs: AdminDialogs = {
    confirm: (config) => new Promise((resolve) => open("confirm", config, (value) => resolve(value === true))),
    alert: (config) => new Promise((resolve) => open("alert", config, (value) => resolve(value === true))),
    prompt: (config) => new Promise((resolve) => open("prompt", config, (value) => resolve(typeof value === "string" ? value : null))),
  };

  return (
    <DialogsContext.Provider value={dialogs}>
      {children}
      {pendingDialog ? (
        <AdminModalDialog
          variant={pendingDialog.variant}
          open
          onOpenChange={(next) => {
            if (next) return;
            pendingDialog.resolve(pendingDialog.variant === "prompt" ? null : false);
            setPendingDialog(undefined);
          }}
          title={pendingDialog.config.title}
          description={pendingDialog.config.description}
          destructive={pendingDialog.config.destructive}
          confirmLabel={pendingDialog.config.confirmLabel}
          defaultInputValue={pendingDialog.config.defaultValue}
          inputLabel={pendingDialog.config.inputLabel}
          inputProps={pendingDialog.config.inputProps}
          validate={pendingDialog.config.validate}
          onConfirm={(value) => {
            pendingDialog.resolve(pendingDialog.variant === "prompt" ? value ?? null : true);
            setPendingDialog(undefined);
          }}
        />
      ) : null}
    </DialogsContext.Provider>
  );
}

export type AdminDialogContextValue = AdminDialogs;

/** The imperative handle the provider builds. A host that never wires a provider gets an error. */
export function useAdminDialog(): AdminDialogs {
  const dialogs = useContext(DialogsContext);
  if (!dialogs) {
    throw new Error("useAdminDialog needs an AdminDialogProvider above the call site.");
  }
  return dialogs;
}

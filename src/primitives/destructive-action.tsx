// SPDX-License-Identifier: MIT
"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "../cn.js";
import { Button, type ButtonVariant } from "./button.js";
import { useAdminMessages } from "../i18n.js";
import {
  AdminModal,
  AdminModalClose,
  AdminModalContent,
  AdminModalDescription,
  AdminModalFooter,
  AdminModalHeader,
  AdminModalTitle,
} from "./modal.js";

function ConfirmSubmitButton({
  label,
  busyLabel,
  className,
}: {
  label: string;
  busyLabel: string;
  className?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="destructive" disabled={pending} className={className}>
      {pending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          {busyLabel}
        </>
      ) : (
        label
      )}
    </Button>
  );
}

export function AdminDestructiveAction({
  buttonText,
  title,
  description,
  confirmLabel,
  cancelLabel,
  busyLabel,
  action,
  hiddenFields,
  onConfirm,
  triggerVariant = "destructive",
  triggerClassName,
  buttonClassName,
  icon = <AlertTriangle className="h-5 w-5" />,
}: {
  buttonText: string;
  title?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busyLabel?: string;
  action?: string | ((formData: FormData) => void | Promise<void>);
  hiddenFields?: Record<string, string | number | undefined>;
  onConfirm?: () => void | Promise<void>;
  triggerVariant?: ButtonVariant;
  triggerClassName?: string;
  buttonClassName?: string;
  icon?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const dialogId = useId();
  const submitButtonRef = useRef<HTMLButtonElement>(null);
  const { pending: formPending } = useFormStatus();
  const [settledFormPending, setSettledFormPending] = useState(formPending);
  const i18n = useAdminMessages();
  const resolvedLabels = {
    title: title ?? i18n.destructive.title,
    description: description ?? i18n.destructive.description,
    confirmLabel: confirmLabel ?? i18n.destructive.confirmLabel,
    cancelLabel: cancelLabel ?? i18n.destructive.cancelLabel,
    busyLabel: busyLabel ?? i18n.destructive.busyLabel,
  };
  const hasFormAction = action !== undefined;

  // Clearing busy tracks a prop transition, so it is applied in the same render rather
  // than in a post-paint effect write.
  if (settledFormPending !== formPending) {
    setSettledFormPending(formPending);
    if (!formPending) {
      setBusy(false);
    }
  }

  const wrappedAction =
    typeof action === "function"
      ? async (formData: FormData) => {
          try {
            await action(formData);
          } finally {
            setOpen(false);
          }
        }
      : action;

  async function handleConfirm() {
    if (!onConfirm) {
      setBusy(true);
      submitButtonRef.current?.click();
      return;
    }

    setBusy(true);
    try {
      await onConfirm();
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        variant={triggerVariant}
        className={cn(triggerClassName, buttonClassName)}
        onClick={() => setOpen(true)}
        aria-controls={dialogId}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        {buttonText}
      </Button>

      {!hasFormAction ? (
        <>
          {hiddenFields
            ? Object.entries(hiddenFields).map(([name, value]) =>
                value === undefined ? null : <input key={name} type="hidden" name={name} value={value} />,
              )
            : null}
          <button
            ref={submitButtonRef}
            type="submit"
            className="hidden"
            formNoValidate
            aria-hidden="true"
            tabIndex={-1}
          />
        </>
      ) : null}

      <AdminModal open={open} onOpenChange={setOpen}>
        <AdminModalContent id={dialogId} closeLabel={resolvedLabels.cancelLabel}>
          <AdminModalHeader className="flex-row items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-red-100 bg-red-50 text-red-600">
              {icon}
            </span>
            <div className="min-w-0 flex-1 space-y-2">
              <AdminModalTitle className="text-lg font-semibold text-zinc-900">
                {resolvedLabels.title}
              </AdminModalTitle>
              <AdminModalDescription className="text-sm leading-relaxed text-zinc-600">
                {resolvedLabels.description}
              </AdminModalDescription>
            </div>
          </AdminModalHeader>

          <AdminModalFooter>
            <AdminModalClose asChild>
              <Button variant="secondary" disabled={busy}>
                {resolvedLabels.cancelLabel}
              </Button>
            </AdminModalClose>
            {hasFormAction ? (
              <form action={wrappedAction} className="flex justify-end">
                {hiddenFields
                  ? Object.entries(hiddenFields).map(([name, value]) =>
                      value === undefined ? null : (
                        <input key={name} type="hidden" name={name} value={value} />
                      ),
                    )
                  : null}
                <ConfirmSubmitButton label={resolvedLabels.confirmLabel} busyLabel={resolvedLabels.busyLabel} />
              </form>
            ) : (
              <Button
                variant="destructive"
                disabled={busy}
                onClick={handleConfirm}
                className={cn(busy && "cursor-wait")}
              >
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {resolvedLabels.busyLabel}
                  </>
                ) : (
                  resolvedLabels.confirmLabel
                )}
              </Button>
            )}
          </AdminModalFooter>
        </AdminModalContent>
      </AdminModal>
    </>
  );
}

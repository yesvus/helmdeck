"use client";

import { useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "../cn";
import { Button, type ButtonVariant } from "./button";
import {
  AdminModal,
  AdminModalClose,
  AdminModalContent,
  AdminModalDescription,
  AdminModalFooter,
  AdminModalHeader,
  AdminModalTitle,
} from "./modal";

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
  title = "Delete this item?",
  description = "This cannot be undone.",
  confirmLabel = "Yes, delete",
  cancelLabel = "Cancel",
  busyLabel = "Working...",
  action,
  hiddenFields,
  onConfirm,
  triggerVariant = "destructive",
  triggerClassName,
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
  icon?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const hasFormAction = action !== undefined;

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
    setBusy(true);
    try {
      await onConfirm?.();
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        variant={triggerVariant}
        className={triggerClassName}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        {buttonText}
      </Button>

      <AdminModal open={open} onOpenChange={setOpen}>
        <AdminModalContent closeLabel={cancelLabel}>
          <AdminModalHeader className="flex-row items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-red-100 bg-red-50 text-red-600">
              {icon}
            </span>
            <div className="min-w-0 flex-1 space-y-2">
              <AdminModalTitle className="text-lg font-semibold text-zinc-900">
                {title}
              </AdminModalTitle>
              <AdminModalDescription className="text-sm leading-relaxed text-zinc-600">
                {description}
              </AdminModalDescription>
            </div>
          </AdminModalHeader>

          <AdminModalFooter>
            <AdminModalClose asChild>
              <Button variant="secondary" disabled={busy}>
                {cancelLabel}
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
                <ConfirmSubmitButton label={confirmLabel} busyLabel={busyLabel} />
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
                    {busyLabel}
                  </>
                ) : (
                  confirmLabel
                )}
              </Button>
            )}
          </AdminModalFooter>
        </AdminModalContent>
      </AdminModal>
    </>
  );
}

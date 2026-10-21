// SPDX-License-Identifier: MIT
"use client";

import { useId } from "react";
import type { ReactNode } from "react";
import { cn } from "../cn.js";
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
import { Button } from "./button.js";

export type AdminRecordDetailLabels = {
  close: string;
  save: string;
  saving: string;
};

export const defaultAdminRecordDetailLabels: AdminRecordDetailLabels = {
  close: "Cancel",
  save: "Save",
  saving: "Saving",
};

export type AdminRecordDetailProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** What the detail shows. */
  children: ReactNode;
  /** The actions in the footer, beside the save button. */
  actions?: ReactNode;
  /** The label of the save button. */
  saveLabel?: string;
  /** The label of the save button while the save is in flight. */
  savingLabel?: string;
  /** The label of the close button. */
  closeLabel?: string;
  /** Whether the save is in flight, which closes the surface's own dismissal. */
  pending?: boolean;
  /** What the save button does. The fields are inside a form, and the button submits it. */
  onSave?: () => void;
  /** The error of the last save, shown under the body. */
  error?: string;
  className?: string;
  labels?: Partial<AdminRecordDetailLabels>;
  trigger?: ReactNode;
};

/**
 * A record's detail, in a dialog.
 *
 * The parts are the package's own, so a host that opens a record for editing writes the fields
 * and not a dialog: the title, the body, the footer and the pending state for the save are here.
 * A host that wants a different shape uses the parts on their own.
 */
export function AdminRecordDetail({
  open,
  onOpenChange,
  title,
  description,
  children,
  actions,
  saveLabel,
  savingLabel,
  closeLabel,
  pending = false,
  onSave,
  error,
  className,
  labels,
  trigger,
}: AdminRecordDetailProps) {
  const merged = { ...defaultAdminRecordDetailLabels, ...labels };
  const formId = useId();

  return (
    <AdminModal open={open} onOpenChange={onOpenChange}>
      {trigger ? <AdminModalTrigger asChild>{trigger}</AdminModalTrigger> : null}
      <AdminModalContent
        className={cn("sm:max-w-2xl", className)}
        preventClose={pending}
        aria-label={title}
      >
        <AdminModalHeader>
          <AdminModalTitle>{title}</AdminModalTitle>
          {description ? <AdminModalDescription>{description}</AdminModalDescription> : null}
        </AdminModalHeader>
        <AdminModalBody>
          {/* The fields are inside a form and the save button submits it, so a host that writes a
              save as a form submission needs no handler of its own. */}
          <form
            id={formId}
            onSubmit={(event) => {
              event.preventDefault();
              onSave?.();
            }}
          >
            {children}
          </form>
          {error ? <p role="alert" className="text-sm leading-5 text-red-700">{error}</p> : null}
        </AdminModalBody>
        <AdminModalFooter>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
            {actions}
            <Button
              type="submit"
              form={formId}
              aria-busy={pending}
              disabled={pending}
              className={cn(pending && "cursor-wait opacity-80")}
            >
              {pending ? (savingLabel ?? merged.saving) : (saveLabel ?? merged.save)}
            </Button>
            <AdminModalClose aria-label={closeLabel ?? merged.close}>
              {closeLabel ?? merged.close}
            </AdminModalClose>
          </div>
        </AdminModalFooter>
      </AdminModalContent>
    </AdminModal>
  );
}

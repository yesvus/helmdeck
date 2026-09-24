// SPDX-License-Identifier: MIT
"use client";

import type { ComponentProps } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "../cn.js";
import { useAdminMessages } from "../i18n.js";

export const AdminModal = DialogPrimitive.Root;
export const AdminModalTrigger = DialogPrimitive.Trigger;
export const AdminModalClose = DialogPrimitive.Close;
export const AdminModalTitle = DialogPrimitive.Title;
export const AdminModalDescription = DialogPrimitive.Description;

export function AdminModalContent({
  className,
  children,
  showCloseButton = true,
  closeLabel,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean;
  closeLabel?: string;
}) {
  const i18n = useAdminMessages();
  const placementClasses = className?.split(/\s+/).map((name) => name.replace(/^!/, "")) ?? [];
  const hasHorizontalPlacement = placementClasses.some((name) =>
    /^(?:-?(?:left|right|start|end|inset-x|inset-inline|inset)-)/.test(name),
  );
  const hasVerticalPlacement = placementClasses.some((name) => /^(?:-?(?:top|bottom|inset-y|inset)-)/.test(name));
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-zinc-950/60 backdrop-blur-sm data-[state=open]:animate-[admin-fade-in_150ms_ease-out]" />
      <DialogPrimitive.Content
        className={cn(
          "fixed z-50 grid max-h-[90vh] w-full max-w-[calc(100%-2rem)] gap-4 overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl sm:max-w-md data-[state=open]:animate-[admin-pop-in_150ms_ease-out_forwards]",
          !hasHorizontalPlacement && "left-1/2",
          !hasVerticalPlacement && "top-1/2",
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton ? (
          <DialogPrimitive.Close
            aria-label={closeLabel ?? i18n.common.close}
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
          >
            <X className="h-4 w-4" />
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function AdminModalHeader({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-2 text-left", className)} {...props} />;
}

export function AdminModalFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  );
}

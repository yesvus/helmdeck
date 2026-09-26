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
  preventClose = false,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean;
  closeLabel?: string;
  preventClose?: boolean;
}) {
  const i18n = useAdminMessages();
  const placementClasses = className?.split(/\s+/).map((name) => name.replace(/^!/, "")) ?? [];
  const hasBaseCustomMaxWidth = placementClasses.some((name) => /^!?max-w-/.test(name));
  const hasBaseCustomWidth = placementClasses.some((name) => /^!?w-/.test(name));
  const hasHorizontalPlacement = placementClasses.some((name) =>
    /^(?:-?(?:left|right|start|end|inset-x|inset-inline|inset)-)/.test(name),
  );
  const hasVerticalPlacement = placementClasses.some((name) => /^(?:-?(?:top|bottom|inset-y|inset)-)/.test(name));
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-admin-overlay/60 backdrop-blur-sm data-[state=open]:animate-[admin-fade-in_150ms_ease-out]" />
      <DialogPrimitive.Content
        className={cn(
          "fixed z-50 flex max-h-[min(90dvh,56rem)] flex-col gap-4 overflow-y-auto overscroll-contain rounded-2xl border border-zinc-200 bg-admin-surface p-6 shadow-2xl data-[state=open]:animate-[admin-pop-in_150ms_ease-out_forwards]",
          !hasBaseCustomWidth && "w-full",
          !hasBaseCustomMaxWidth && "max-w-[calc(100%-2rem)] sm:max-w-md",
          !hasHorizontalPlacement && "left-1/2 -translate-x-1/2",
          !hasVerticalPlacement && "top-1/2 -translate-y-1/2",
          className,
        )}
        {...props}
        onEscapeKeyDown={(event) => {
          if (preventClose) event.preventDefault();
          props.onEscapeKeyDown?.(event);
        }}
        onPointerDownOutside={(event) => {
          if (preventClose) event.preventDefault();
          props.onPointerDownOutside?.(event);
        }}
      >
        {children}
        {showCloseButton ? (
          <DialogPrimitive.Close
            aria-label={closeLabel ?? i18n.common.close}
            disabled={preventClose}
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
  return <div className={cn("-mx-6 -mt-6 flex shrink-0 flex-col gap-2 border-b border-admin-border bg-admin-surface-subtle px-6 py-4 pr-14 text-left", className)} {...props} />;
}

export function AdminModalBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain py-1", className)} {...props} />;
}

export function AdminModalFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("-mx-6 -mb-6 mt-2 flex shrink-0 flex-col-reverse gap-2 border-t border-admin-border bg-admin-surface-subtle px-6 py-4 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  );
}

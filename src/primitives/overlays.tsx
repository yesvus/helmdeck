// SPDX-License-Identifier: MIT
"use client";

import type { ComponentProps } from "react";
import * as ContextMenuPrimitive from "@radix-ui/react-context-menu";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { X } from "lucide-react";
import { cn } from "../cn.js";
import { useAdminMessages } from "../i18n.js";
import { hasMaxWidthUtility, hasWidthUtility } from "./geometry.js";
const overlayContentClassName =
  "z-50 rounded-admin-card border border-zinc-200 bg-admin-surface p-1 text-sm shadow-xl outline-none data-[state=open]:animate-[admin-pop-in_150ms_ease-out_forwards]";

export const AdminDropdownMenu = DropdownMenuPrimitive.Root;
export const AdminDropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const AdminDropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

export function AdminDropdownMenuContent({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content className={cn(overlayContentClassName, "min-w-48", className)} {...props} />
    </DropdownMenuPrimitive.Portal>
  );
}

export function AdminDropdownMenuItem({
  className,
  destructive = false,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Item> & { destructive?: boolean }) {
  return (
    <DropdownMenuPrimitive.Item
      className={cn(
        "flex cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-1.5 outline-none transition-colors",
        "focus:bg-zinc-100 focus:text-zinc-900 data-[highlighted]:bg-zinc-100 data-[highlighted]:text-zinc-900",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        destructive && "text-admin-danger-action focus:bg-red-50 focus:text-admin-danger-action",
        className,
      )}
      {...props}
    />
  );
}

export function AdminDropdownMenuCheckboxItem({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem>) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      className={cn(
        "flex cursor-pointer select-none items-center gap-2 rounded-md py-1.5 pl-8 pr-2.5 outline-none transition-colors",
        "focus:bg-zinc-100 focus:text-zinc-900 data-[highlighted]:bg-zinc-100 data-[highlighted]:text-zinc-900",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center" aria-hidden="true">
        <DropdownMenuPrimitive.ItemIndicator>
          <svg viewBox="0 0 12 12" className="h-3.5 w-3.5 fill-current">
            <path d="M9.5 2.5 4.5 8 2 5.5 3 4.5l1.5 1.5L8.5 2z" />
          </svg>
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
    </DropdownMenuPrimitive.CheckboxItem>
  );
}

export function AdminDropdownMenuRadioItem({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.RadioItem>) {
  return (
    <DropdownMenuPrimitive.RadioItem
      className={cn(
        "relative flex cursor-pointer select-none items-center gap-2 rounded-md py-1.5 pl-8 pr-2.5 outline-none transition-colors",
        "focus:bg-zinc-100 focus:text-zinc-900 data-[highlighted]:bg-zinc-100 data-[highlighted]:text-zinc-900",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center" aria-hidden="true">
        <DropdownMenuPrimitive.ItemIndicator>
          <svg viewBox="0 0 12 12" className="h-2 w-2 fill-current">
            <circle cx="6" cy="6" r="5" />
          </svg>
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
    </DropdownMenuPrimitive.RadioItem>
  );
}

export function AdminDropdownMenuLabel({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Label>) {
  return (
    <DropdownMenuPrimitive.Label
      className={cn("px-2.5 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500", className)}
      {...props}
    />
  );
}

export function AdminDropdownMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return <DropdownMenuPrimitive.Separator className={cn("my-1 h-px bg-zinc-200", className)} {...props} />;
}

/**
 * The popover root. The focus moves into the popover while it is open and is given back to the
 * trigger when it closes.
 *
 * The popover is not modal by default: a modal popover makes the page behind it inert and hides it
 * from screen readers, which is a bigger change than a popover should make on its own. A host that
 * wants the focus held inside the popover passes `modal`.
 */
export function AdminPopover({
  modal = false,
  ...props
}: ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root modal={modal} {...props} />;
}

export const AdminPopoverTrigger = PopoverPrimitive.Trigger;
export const AdminPopoverClose = PopoverPrimitive.Close;
export const AdminPopoverTitle = PopoverPrimitive.Title;
export const AdminPopoverDescription = PopoverPrimitive.Description;

export function AdminPopoverContent({
  className,
  ...props
}: ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        className={cn(overlayContentClassName, "w-72 p-3", className)}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

export const AdminContextMenu = ContextMenuPrimitive.Root;
export const AdminContextMenuTrigger = ContextMenuPrimitive.Trigger;

export function AdminContextMenuContent({
  className,
  ...props
}: ComponentProps<typeof ContextMenuPrimitive.Content>) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Content className={cn(overlayContentClassName, "min-w-48", className)} {...props} />
    </ContextMenuPrimitive.Portal>
  );
}

export function AdminContextMenuItem({
  className,
  destructive = false,
  ...props
}: ComponentProps<typeof ContextMenuPrimitive.Item> & { destructive?: boolean }) {
  return (
    <ContextMenuPrimitive.Item
      className={cn(
        "flex cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-1.5 outline-none transition-colors",
        "focus:bg-zinc-100 focus:text-zinc-900 data-[highlighted]:bg-zinc-100 data-[highlighted]:text-zinc-900",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        destructive && "text-admin-danger-action focus:bg-red-50 focus:text-admin-danger-action",
        className,
      )}
      {...props}
    />
  );
}

export function AdminContextMenuLabel({
  className,
  ...props
}: ComponentProps<typeof ContextMenuPrimitive.Label>) {
  return (
    <ContextMenuPrimitive.Label
      className={cn("px-2.5 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500", className)}
      {...props}
    />
  );
}

export function AdminContextMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof ContextMenuPrimitive.Separator>) {
  return <ContextMenuPrimitive.Separator className={cn("my-1 h-px bg-zinc-200", className)} {...props} />;
}

export type AdminSheetSide = "right" | "left" | "top" | "bottom";

export const AdminSheet = DialogPrimitive.Root;
export const AdminSheetTrigger = DialogPrimitive.Trigger;
export const AdminSheetClose = DialogPrimitive.Close;
export const AdminSheetTitle = DialogPrimitive.Title;
export const AdminSheetDescription = DialogPrimitive.Description;

export function AdminSheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  closeLabel,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & {
  side?: AdminSheetSide;
  showCloseButton?: boolean;
  closeLabel?: string;
}) {
  const i18n = useAdminMessages();
  const widthGiven = hasWidthUtility(className) || hasMaxWidthUtility(className);
  const vertical = side === "right" || side === "left";
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-admin-overlay/60 backdrop-blur-sm data-[state=open]:animate-[admin-fade-in_150ms_ease-out]" />
      <DialogPrimitive.Content
        className={cn(
          "fixed z-50 flex max-h-[min(56rem,100dvh_-_4rem)] flex-col gap-4 overflow-hidden overscroll-contain rounded-admin-card border border-zinc-300 bg-admin-surface p-6 shadow-2xl data-[state=open]:animate-[admin-pop-in_150ms_ease-out_forwards]",
          // The sheet is anchored to an edge, so the modal's centring rules do not apply to it. The
          // measurements do: it keeps 2rem clear of the top and bottom edges, and 1rem clear of the
          // side edges it is not attached to.
          vertical ? "inset-y-0 my-8" : "inset-x-0 mx-8",
          side === "right" && "right-0",
          side === "left" && "left-0",
          side === "top" && "top-0",
          side === "bottom" && "bottom-0",
          // The width belongs to the consumer, the same way it does for the modal: a width the
          // consumer gave replaces the default rather than competing with it.
          !widthGiven && vertical && "w-[calc(100%_-_2rem)] sm:max-w-md",
          !widthGiven && !vertical && "w-[calc(100%_-_4rem)]",
          widthGiven && !hasMaxWidthUtility(className) && "max-w-[calc(100%_-_2rem)]",
          showCloseButton && "[&>:first-child]:pr-14",
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton ? (
          <DialogPrimitive.Close
            aria-label={closeLabel ?? i18n.common.close}
            className="absolute right-5 top-5 flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
          >
            <X className="h-4 w-4" />
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function AdminSheetHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("flex shrink-0 flex-col gap-2 border-b border-admin-border bg-admin-surface-subtle text-left", className)}
      {...props}
    />
  );
}

export function AdminSheetBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain py-1", className)} {...props} />;
}

export function AdminSheetFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("flex shrink-0 flex-col-reverse gap-2 border-t border-admin-border bg-admin-surface-subtle sm:flex-row sm:justify-end", className)}
      {...props}
    />
  );
}

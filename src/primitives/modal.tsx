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

// Tailwind variants carry digits ("2xl:"), brackets, and pseudo-classes ("[&:hover]:",
// "min-[900px]:"), so splitting on the last colon is wrong and matching "[a-z]+:" silently
// ignores every breakpoint from 2xl up. Take the segment after the final colon that sits
// outside any brackets, which resolves all of those forms.
function utilityName(className: string): string {
  let depth = 0;
  let start = 0;
  for (let index = 0; index < className.length; index += 1) {
    const character = className[index];
    if (character === "[" || character === "(") depth += 1;
    else if (character === "]" || character === ")") depth -= 1;
    else if (character === ":" && depth === 0) start = index + 1;
  }
  return className.slice(start);
}

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
  const utilities = className?.split(/\s+/).map((name) => utilityName(name).replace(/^!/, "")) ?? [];
  // A gutter class is a width and a max-w is not, so they answer separate questions. A max-w-only
  // consumer keeps the gutter. A w-only consumer needs an explicit bound instead, because with the
  // gutter gone nothing stops a fixed rem width from exceeding the viewport. The default cap
  // surrenders to either, since a max-width smaller than the requested width wins by clamping
  // rather than losing the cascade.
  const hasWidthUtility = utilities.some((name) => /^w-/.test(name));
  const hasMaxWidthUtility = utilities.some((name) => /^max-w-/.test(name));
  const hasAnyWidthUtility = hasWidthUtility || hasMaxWidthUtility;
  // A bare "inset-" places on both axes, but "inset-x-" only the horizontal and "inset-y-" only the
  // vertical. Without the exclusions each one suppressed the opposite axis's centring anchor too.
  const hasHorizontalPlacement = utilities.some((name) =>
    /^-?(?:left|right|start|end|inset-x|inset-inline|inset(?!-(?:y|block)))-/.test(name),
  );
  const hasVerticalPlacement = utilities.some((name) =>
    /^-?(?:top|bottom|inset-y|inset-block|inset(?!-(?:x|inline)))-/.test(name),
  );
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-admin-overlay/60 backdrop-blur-sm data-[state=open]:animate-[admin-fade-in_150ms_ease-out]" />
      <DialogPrimitive.Content
        className={cn(
          // Clips rather than scrolls: AdminModalBody is the only scroll container, so the header and
          // footer stay pinned. Content scrolling here as well gave a tall dialog two live
          // scrollbars at once, and the inner one sat inside the body's right padding.
          // The previous 90dvh made the top and bottom margin a percentage of the viewport, so it was
          // 40px on a phone and 108px on a 2160p display, and matched neither the side margin nor
          // anything else on the page. Tailwind unwraps calc() here, emitting
          // "min(56rem, 100dvh - 4rem)", so the dialog keeps 2rem clear of the top and bottom edges
          // whenever its content is tall enough to reach the cap.
          "fixed z-50 flex max-h-[min(56rem,100dvh_-_4rem)] flex-col gap-4 overflow-hidden overscroll-contain rounded-2xl border border-zinc-300 bg-admin-surface p-6 shadow-2xl data-[state=open]:animate-[admin-pop-in_150ms_ease-out_forwards]",
          // Below sm the dialog spans the width less 1rem per side. From sm up it is capped and
          // centred, so the side margin grows with the viewport: 4rem at 640px, 704px at 1920px.
          // There is deliberately no "sm:w-..." here. The cap is the smaller value at every width
          // above sm, so such a class never decided the rendered width.
          !hasWidthUtility && "w-[calc(100%_-_2rem)]",
          // 32rem, the width shadcn/ui defaults a dialog to. Ant Design's 520px is 32.5rem.
          !hasAnyWidthUtility && "sm:max-w-lg",
          hasWidthUtility && !hasMaxWidthUtility && "max-w-[calc(100%_-_2rem)]",
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
  return <div className={cn("flex shrink-0 flex-col gap-2 border-b border-admin-border bg-admin-surface-subtle text-left", className)} {...props} />;
}

export function AdminModalBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain py-1", className)} {...props} />;
}

export function AdminModalFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("flex shrink-0 flex-col-reverse gap-2 border-t border-admin-border bg-admin-surface-subtle sm:flex-row sm:justify-end", className)}
      {...props}
    />
  );
}

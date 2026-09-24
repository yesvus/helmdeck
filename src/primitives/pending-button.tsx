// SPDX-License-Identifier: MIT
"use client";

import type { ComponentType, ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { cn } from "../cn.js";
import { Button, type ButtonProps, type ButtonVariant } from "./button.js";

export type AdminPendingButtonProps = Omit<ButtonProps, "children"> & {
  label: ReactNode;
  pendingLabel?: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  tone?: "primary" | "secondary" | "danger";
  children?: ReactNode;
};

const pendingToneVariants: Record<NonNullable<AdminPendingButtonProps["tone"]>, ButtonVariant> = {
  primary: "default",
  secondary: "outline",
  danger: "outline",
};

export function AdminPendingButton({
  label,
  pendingLabel,
  icon: Icon,
  tone = "primary",
  type = "submit",
  children,
  disabled,
  variant,
  className,
  ...props
}: AdminPendingButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button
      variant={variant ?? pendingToneVariants[tone]}
      type={type}
      disabled={disabled || pending}
      className={cn(
        tone === "danger" && !variant && "border border-red-200 bg-admin-surface text-red-700 hover:bg-red-50",
        pending && "cursor-wait opacity-80",
        !pending && disabled && "cursor-not-allowed opacity-50",
        className,
      )}
      aria-busy={pending}
      aria-disabled={disabled || pending}
      {...props}
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon ? <Icon className="h-4 w-4" /> : null}
      {pending && pendingLabel !== undefined ? pendingLabel : label}
      {children}
    </Button>
  );
}

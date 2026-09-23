// SPDX-License-Identifier: MIT
"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "./button";

export function AdminSubmitButton({
  label,
  pendingLabel = "Working...",
  icon,
  disabled,
  className,
  children,
  ...props
}: Omit<ButtonProps, "children"> & {
  label: string;
  pendingLabel?: string;
  icon?: ReactNode;
  children?: ReactNode;
}) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      disabled={disabled || pending}
      aria-busy={pending}
      className={className}
      {...props}
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {pending ? pendingLabel : label}
      {children}
    </Button>
  );
}

// SPDX-License-Identifier: MIT
"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, Save } from "lucide-react";
import { Button, type ButtonProps } from "./button.js";
import { useAdminFormDirty } from "./managed-form.js";
import { useAdminMessages } from "../i18n.js";

export function AdminSaveButton({
  label,
  pendingLabel,
  type = "submit",
  formAction,
  form,
  className,
}: {
  label: string;
  pendingLabel?: string;
  type?: "submit" | "button";
  formAction?: string;
  form?: string;
  className?: string;
}) {
  const i18n = useAdminMessages();
  return (
    <AdminSubmitButton
      className={className}
      form={form}
      formAction={formAction}
      label={label}
      pendingLabel={pendingLabel ?? i18n.form.pendingLabel}
      type={type}
    />
  );
}

export function AdminSubmitButton({
  label,
  pendingLabel,
  icon = <Save className="h-4 w-4" />,
  disabled,
  className,
  children,
  type = "submit",
  variant,
  ...props
}: Omit<ButtonProps, "children"> & {
  label: string;
  pendingLabel?: string;
  icon?: ReactNode;
  children?: ReactNode;
}) {
  const { pending } = useFormStatus();
  const i18n = useAdminMessages();
  const isDirty = useAdminFormDirty();
  const managed = isDirty !== undefined;
  const isDisabled = disabled || pending || (managed && !isDirty);

  return (
    <Button
      type={type}
      variant={variant ?? (isDirty ? "success" : "default")}
      disabled={isDisabled}
      aria-busy={pending}
      aria-disabled={isDisabled}
      className={className}
      {...props}
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {pending ? pendingLabel ?? i18n.form.pendingLabel : label}
      {children}
    </Button>
  );
}

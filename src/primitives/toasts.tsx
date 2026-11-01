// SPDX-License-Identifier: MIT
// Hosts importing AdminToast must install sonner.
"use client";

import { Toaster, toast as sonnerToast } from "sonner";
import { useAdminTheme } from "../theme/index.js";

type ToastId = string | number;
type ToastInput = { id?: ToastId };

export const toast = {
  success: (message: string, options?: ToastInput): ToastId => sonnerToast.success(message, options),
  error: (message: string, options?: ToastInput): ToastId => sonnerToast.error(message, options),
  loading: (message: string, options?: ToastInput): ToastId => sonnerToast.loading(message, options),
  dismiss: (id: ToastId) => sonnerToast.dismiss(id),
  dismissAll: () => sonnerToast.dismiss(),
};

export function AdminToast() {
  const { resolvedTheme } = useAdminTheme();
  return (
    <Toaster
      position="bottom-right"
      theme={resolvedTheme}
      richColors={false}
      containerAriaLabel="Notifications"
      toastOptions={{
        classNames: {
          toast: "!border !border-zinc-300 !bg-admin-surface !text-admin-foreground",
          title: "!text-admin-foreground",
          description: "!text-zinc-600",
          actionButton: "!border-zinc-300 !bg-admin-surface !text-admin-foreground",
          cancelButton: "!border-zinc-300 !bg-admin-surface !text-admin-foreground",
        },
      }}
    />
  );
}

// SPDX-License-Identifier: MIT
import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "../cn.js";

export type ButtonVariant =
  | "default"
  | "destructive"
  | "success"
  | "outline"
  | "secondary"
  | "ghost"
  | "link"
  | "white";

export type ButtonSize = "default" | "sm" | "lg" | "icon";

const baseClassName =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-bold uppercase transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-500 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0";

const variantClassName: Record<ButtonVariant, string> = {
  default: "bg-brand-500 text-white hover:bg-brand-600",
  destructive: "bg-red-500 text-white hover:bg-red-600",
  success: "bg-emerald-600 text-white hover:bg-emerald-500",
  outline: "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900",
  secondary: "bg-zinc-100 text-zinc-900 hover:bg-zinc-200",
  ghost: "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
  link: "normal-case text-brand-600 underline-offset-4 hover:underline",
  white: "bg-white text-zinc-900 hover:bg-zinc-200",
};

const sizeClassName: Record<ButtonSize, string> = {
  default: "h-9 px-4",
  sm: "h-8 px-3 text-xs",
  lg: "h-12 px-8",
  icon: "h-9 w-9",
};

export function buttonVariants({
  variant = "default",
  size = "default",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}): string {
  return cn(baseClassName, variantClassName[variant], sizeClassName[size], className);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  asChild?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  children,
  type,
  ref,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      ref={ref}
      type={asChild ? undefined : (type ?? "button")}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {children as ReactNode}
    </Comp>
  );
}

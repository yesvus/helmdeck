// SPDX-License-Identifier: MIT
import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { cn } from "../cn.js";
import { buttonVariants } from "./button.js";

export function AdminSurfaceCard({
  id,
  children,
  className,
}: {
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={cn(
        "rounded-xl border border-zinc-200 bg-white shadow-[0_18px_45px_-32px_rgba(15,23,42,0.22)]",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function AdminSectionCard({
  id,
  icon: Icon,
  title,
  description,
  action,
  children,
  className,
}: {
  id?: string;
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <AdminSurfaceCard id={id} className={cn("scroll-mt-24 overflow-hidden", className)}>
      <div className="flex flex-col gap-4 border-b border-zinc-100 px-5 py-5 sm:flex-row sm:items-start sm:justify-between lg:px-6">
        <div className={cn("flex gap-3", description ? "items-start" : "items-center")}>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
            {description ? <p className="mt-1 text-sm leading-7 text-zinc-500">{description}</p> : null}
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="px-5 py-5 lg:px-6">{children}</div>
    </AdminSurfaceCard>
  );
}

export function AdminSectionIntro({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className={cn("flex gap-3", description ? "items-start" : "items-center")}>
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
          {description ? <p className="mt-1 text-sm leading-7 text-zinc-500">{description}</p> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export type AdminStatCardTone = "neutral" | "success" | "warning" | "danger";

const adminStatCardToneClasses: Record<AdminStatCardTone, string> = {
  neutral: "bg-white text-zinc-600",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-red-50 text-red-700",
};

export function AdminStatCard({
  icon: Icon,
  label,
  value,
  detail,
  tone = "neutral",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  tone?: AdminStatCardTone;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">{label}</p>
          <p className="mt-3 text-3xl font-bold text-zinc-900">{value}</p>
          <p className="mt-2 text-sm leading-6 text-zinc-500">{detail}</p>
        </div>
        <div className={cn("flex h-11 w-11 items-center justify-center rounded-lg shadow-sm", adminStatCardToneClasses[tone])}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

export function AdminFormCard({
  title,
  subtitle,
  children,
  accent = "default",
  collapsible = false,
  defaultOpen = true,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  accent?: "default" | "muted";
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const cardClassName = cn(
    "rounded-lg border p-4",
    accent === "muted" ? "border-dashed border-zinc-300 bg-zinc-50" : "border-zinc-200 bg-white",
  );
  const header = (
    <div className={cn(collapsible && "flex items-start justify-between gap-4")}>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-zinc-900">{title}</p>
        {subtitle ? <p className="mt-1 text-xs leading-6 text-zinc-500">{subtitle}</p> : null}
      </div>
      {collapsible ? (
        <span
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-500 transition-transform duration-200 group-open:rotate-180"
          aria-hidden="true"
        >
          <ChevronDown className="h-4 w-4" />
        </span>
      ) : null}
    </div>
  );

  if (collapsible) {
    return (
      <details open={defaultOpen} className={cn("group", cardClassName)}>
        <summary className="cursor-pointer list-none">{header}</summary>
        <div className="mt-4">{children}</div>
      </details>
    );
  }

  return (
    <div className={cardClassName}>
      <div className="mb-4">{header}</div>
      {children}
    </div>
  );
}

export function AdminSplitFormLayout({
  content,
  sidebar,
  contentClassName,
  sidebarClassName,
}: {
  content: ReactNode;
  sidebar: ReactNode;
  contentClassName?: string;
  sidebarClassName?: string;
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className={cn("space-y-5", contentClassName)}>{content}</div>
      <div className={cn("space-y-5 xl:sticky xl:top-[calc(72px+1.5rem)] xl:self-start", sidebarClassName)}>
        {sidebar}
      </div>
    </div>
  );
}

export function AdminListItemCard({
  title,
  subtitle,
  meta,
  action,
}: {
  title: string;
  subtitle?: string;
  meta?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="text-base font-semibold text-zinc-900">{title}</p>
          {subtitle ? <p className="text-sm leading-6 text-zinc-500">{subtitle}</p> : null}
          {meta ? <div className="pt-1 text-xs leading-6 text-zinc-500">{meta}</div> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}

export type AdminBannerTone = "info" | "success" | "warning" | "error";

const adminBannerToneClasses: Record<AdminBannerTone, string> = {
  info: "border-zinc-200 bg-zinc-50 text-zinc-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  error: "border-red-200 bg-red-50 text-red-900",
};

export function AdminBanner({
  tone,
  title,
  body,
}: {
  tone: AdminBannerTone;
  title: string;
  body: string;
}) {
  return (
    <div className={cn("rounded-lg border px-4 py-3 text-sm", adminBannerToneClasses[tone])}>
      <p className="font-semibold">{title}</p>
      <p className="mt-1 break-all">{body}</p>
    </div>
  );
}

export function AdminPageActionLink({
  href,
  label,
  tone = "primary",
  className,
}: {
  href: string;
  label: string;
  tone?: "primary" | "secondary";
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={buttonVariants({ variant: tone === "primary" ? "default" : "outline", className })}
    >
      {label}
    </Link>
  );
}

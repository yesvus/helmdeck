// SPDX-License-Identifier: MIT
import type { ReactNode } from "react";
import Link from "next/link.js";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { cn } from "../cn.js";
import { buttonVariants } from "./button.js";
import { AdminContextualHelp } from "./contextual-help.js";
import { adminToneClasses, type AdminTone } from "./tone.js";

// One surface contract for every card-like primitive. These had drifted across three radius values
// and two surfaces, which read as different products on one page. The background is deliberately
// not part of the shared string: cn does not merge, so a shared "bg-" plus a per-variant "bg-"
// would leave two background utilities in the class list and hand the decision to stylesheet order.
const adminCardSurfaceClasses = "rounded-admin-card border border-admin-border";
const adminCardHeaderClasses = "border-b border-admin-border bg-admin-surface-subtle";
const adminCardFooterClasses = "border-t border-admin-border bg-admin-surface-subtle";
const adminCardActionsClasses = "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end";

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
      className={cn(adminCardSurfaceClasses, "bg-admin-surface shadow-sm", className)}
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
      <div className={cn("flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-start sm:justify-between lg:px-6", adminCardHeaderClasses)}>
        <div className={cn("flex gap-3", description ? "items-start" : "items-center")}>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-admin-control bg-zinc-100 text-zinc-700">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="flex min-w-0 flex-wrap items-center gap-x-1 text-base font-semibold leading-snug text-zinc-900"><span>{title}</span>{description ? <AdminContextualHelp label={`Help: ${title}`}>{description}</AdminContextualHelp> : null}</h2>
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
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-admin-control bg-zinc-100 text-zinc-700">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h2 className="flex min-w-0 flex-wrap items-center gap-x-1 text-lg font-semibold text-zinc-900"><span>{title}</span>{description ? <AdminContextualHelp label={`Help: ${title}`}>{description}</AdminContextualHelp> : null}</h2>
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

// Both are the shared union under the names their props have always published, so a host that
// imported either keeps compiling. See tone.ts for the vocabulary and the severity alias.
export type AdminStatCardTone = AdminTone;

const adminStatCardToneClasses = adminToneClasses(
  {
    neutral: "bg-admin-surface text-zinc-600",
    info: "bg-sky-50 text-sky-700",
    success: "bg-emerald-50 text-emerald-700",
    warning: "bg-amber-50 text-amber-700",
  },
  "bg-red-50 text-red-700",
);

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
    <div className={cn(adminCardSurfaceClasses, "bg-admin-surface p-4")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex min-w-0 flex-wrap items-center gap-x-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500"><span>{label}</span><AdminContextualHelp label={`Help: ${label}`}>{detail}</AdminContextualHelp></p>
          <p className="mt-3 text-3xl font-bold text-zinc-900">{value}</p>
        </div>
        <div className={cn("flex h-11 w-11 items-center justify-center rounded-admin-control shadow-sm", adminStatCardToneClasses[tone])}>
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
  action,
  accent = "default",
  collapsible = false,
  defaultOpen = true,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  action?: ReactNode;
  accent?: "default" | "muted";
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const cardClassName = cn(
    "overflow-hidden",
    adminCardSurfaceClasses,
    accent === "muted" ? "border-dashed bg-admin-surface-subtle" : "bg-admin-surface",
  );
  // The row lays the title and chevron out; the surface belongs to the summary or the
  // wrapper, so a collapsible card does not get padding and a border applied twice.
  const headerSurfaceClassName = cn("px-4 py-3.5", adminCardHeaderClasses);
  const header = (
    <div className="flex min-w-0 items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="flex min-w-0 flex-wrap items-center gap-x-1 text-sm font-semibold text-zinc-900"><span>{title}</span>{subtitle ? <AdminContextualHelp label={`Help: ${title}`}>{subtitle}</AdminContextualHelp> : null}</p>
      </div>
      {collapsible ? (
        <span
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-admin-surface text-zinc-500 transition-transform duration-200 group-open:rotate-180"
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
        <summary className={cn("cursor-pointer list-none", headerSurfaceClassName)}>{header}</summary>
        <div className="p-4">{children}</div>
        {/* The action cannot live in the header here: a summary row is the disclosure control, so a
            button inside it toggles the card as well as activating itself. A footer is the
            consistent region for it, and matches how the modal separates its actions. */}
        {action ? <div className={cn("px-4 py-3", adminCardFooterClasses, adminCardActionsClasses)}>{action}</div> : null}
      </details>
    );
  }

  return (
    <div className={cardClassName}>
      <div className={cn("flex items-center justify-between gap-4", headerSurfaceClassName)}>
        {header}
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="p-4">{children}</div>
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
      <div className={cn("space-y-5 xl:sticky xl:top-6 xl:self-start", sidebarClassName)}>
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
    <div className={cn(adminCardSurfaceClasses, "bg-admin-surface p-4")}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="flex min-w-0 flex-wrap items-center gap-x-1 text-base font-semibold text-zinc-900"><span>{title}</span>{subtitle ? <AdminContextualHelp label={`Help: ${title}`}>{subtitle}</AdminContextualHelp> : null}</p>
          {meta ? <div className="pt-1 text-xs leading-6 text-zinc-500">{meta}</div> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}

export type AdminBannerTone = AdminTone;

// The banner's info tone has always been the unaccented zinc treatment, so neutral reuses it
// rather than inventing a second unaccented look the two spellings could then disagree about.
const adminBannerNeutralClasses = "border-zinc-200 bg-zinc-50 text-zinc-700";

const adminBannerToneClasses = adminToneClasses(
  {
    neutral: adminBannerNeutralClasses,
    info: adminBannerNeutralClasses,
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
  },
  "border-red-200 bg-red-50 text-red-900",
);

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
    <div className={cn("rounded-admin-card border px-4 py-3 text-sm", adminBannerToneClasses[tone])}>
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

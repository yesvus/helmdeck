// SPDX-License-Identifier: MIT
"use client";

import { useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "../cn.js";
import { AdminContextualHelp } from "./contextual-help.js";

export type AdminTabItem = {
  id: string;
  label: ReactNode;
  children: ReactNode;
  disabled?: boolean;
};

export type AdminTabsProps = {
  items: AdminTabItem[];
  value?: string;
  defaultTabId?: string;
  onValueChange?: (id: string) => void;
  label?: string;
  className?: string;
  tabClassName?: string;
};

/**
 * Tabs, on the ARIA tabs pattern: one tab is selected at a time, the arrow keys move between the
 * tabs and the panel that belongs to the selected tab is the one on screen.
 */
export function AdminTabs({
  items,
  value,
  defaultTabId,
  onValueChange,
  label,
  className,
  tabClassName,
}: AdminTabsProps) {
  const baseId = useId();
  const generatedId = useId();
  const [uncontrolled, setUncontrolled] = useState(defaultTabId ?? items[0]?.id ?? "");
  const selected = value ?? uncontrolled;
  const tabs = useRef(new Map<string, HTMLButtonElement>());

  const select = (id: string) => {
    if (value === undefined) setUncontrolled(id);
    onValueChange?.(id);
  };

  const move = (from: string, key: string) => {
    const enabled = items.filter((item) => !item.disabled);
    if (enabled.length === 0) return;
    const current = enabled.findIndex((item) => item.id === from);
    const next = key === "Home"
      ? enabled[0]
      : key === "End"
        ? enabled[enabled.length - 1]
        : enabled[(current + (key === "ArrowRight" || key === "ArrowDown" ? 1 : -1) + enabled.length) % enabled.length];
    if (!next) return;
    select(next.id);
    tabs.current.get(next.id)?.focus();
  };

  return (
    <div className={cn("grid gap-4", className)}>
      <div role="tablist" aria-label={label ?? generatedId} className="flex flex-wrap gap-1 border-b border-zinc-200">
        {items.map((item) => {
          const isSelected = item.id === selected;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`${baseId}-tab-${item.id}`}
              aria-selected={isSelected}
              aria-controls={`${baseId}-panel-${item.id}`}
              tabIndex={isSelected ? 0 : -1}
              disabled={item.disabled}
              onClick={() => select(item.id)}
              onKeyDown={(event) => {
                if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                move(item.id, event.key);
              }}
              ref={(element) => {
                if (element) tabs.current.set(item.id, element);
                else tabs.current.delete(item.id);
              }}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                isSelected
                  ? "border-brand-500 text-admin-brand-text"
                  : "border-transparent text-zinc-500 hover:text-zinc-900",
                tabClassName,
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {items.map((item) => (
        <div
          key={item.id}
          role="tabpanel"
          id={`${baseId}-panel-${item.id}`}
          aria-labelledby={`${baseId}-tab-${item.id}`}
          hidden={item.id !== selected}
          tabIndex={0}
          className="min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          {item.children}
        </div>
      ))}
    </div>
  );
}

export type AdminAccordionItem = {
  id: string;
  title: ReactNode;
  description?: string;
  children: ReactNode;
  disabled?: boolean;
};

export type AdminAccordionProps = {
  items: AdminAccordionItem[];
  /** One panel open at a time, or any number of them open at once. */
  type?: "single" | "multiple";
  defaultOpenIds?: string[];
  openIds?: string[];
  onOpenChange?: (openIds: string[]) => void;
  className?: string;
};

/**
 * Panels that fold away. The panel header is the summary of a native disclosure, so it opens with
 * the enter and space keys without a keyboard model of its own, and the open panels are the ones
 * the caller says are open: one in single mode, any number in multiple mode.
 */
export function AdminAccordion({
  items,
  type = "single",
  defaultOpenIds = [],
  openIds,
  onOpenChange,
  className,
}: AdminAccordionProps) {
  const [uncontrolled, setUncontrolled] = useState<string[]>(defaultOpenIds);
  const open = openIds ?? uncontrolled;
  // The panels are told which of them are open, and the browser answers with a toggle event for
  // every one of them that changes. Closing one panel to open another is such a change, and this
  // keeps that answer from being read as the reader's own.
  const intended = useRef(new Set(open));
  intended.current = new Set(open);

  const toggle = (id: string, isOpen: boolean) => {
    if (intended.current.has(id) === isOpen) return;
    const next = type === "single"
      ? (isOpen ? [id] : [])
      : isOpen
        ? [...new Set([...open, id])]
        : open.filter((candidate) => candidate !== id);
    if (openIds === undefined) setUncontrolled(next);
    onOpenChange?.(next);
  };

  return (
    <div className={cn("grid gap-3", className)}>
      {items.map((item) => {
        const isOpen = open.includes(item.id);
        return (
          <details
            key={item.id}
            open={isOpen}
            onToggle={(event) => toggle(item.id, event.currentTarget.open)}
            className="rounded-admin-card border border-zinc-200 bg-zinc-50 px-4 py-4"
          >
            <summary className="cursor-pointer list-none">
              <span className="flex items-start justify-between gap-4">
                <span>
                  <span className="flex min-w-0 flex-wrap items-center gap-x-1">
                    <span className="text-sm font-semibold text-zinc-900">{item.title}</span>
                    {item.description ? (
                      <AdminContextualHelp label={`Help: ${typeof item.title === "string" ? item.title : item.id}`}>
                        {item.description}
                      </AdminContextualHelp>
                    ) : null}
                  </span>
                </span>
                <span
                  className={cn(
                    "mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-admin-surface text-zinc-500 transition-transform duration-200",
                    isOpen && "rotate-180",
                  )}
                  aria-hidden="true"
                >
                  <ChevronDown className="h-4 w-4" />
                </span>
              </span>
            </summary>
            <div className="mt-4">{item.children}</div>
          </details>
        );
      })}
    </div>
  );
}

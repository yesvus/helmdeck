// SPDX-License-Identifier: MIT
"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Search, X } from "lucide-react";
import { cn } from "../cn.js";
import { AdminSkeleton } from "./skeleton.js";

export type AdminComboboxOption<TValue = unknown> = {
  id: string;
  label: string;
  description?: string;
  /** What the host needs to act on the option, carried through untouched. */
  value?: TValue;
};

export type AdminComboboxProps<TValue = unknown> = {
  label: string;
  /** Loads the options for a term. The signal is aborted when the term changes or the list closes. */
  load: (term: string, signal: AbortSignal) => Promise<AdminComboboxOption<TValue>[]>;
  onSelect?: (option: AdminComboboxOption<TValue>) => void;
  placeholder?: string;
  emptyLabel?: string;
  loadingLabel?: string;
  errorLabel?: string;
  retryLabel?: string;
  closeLabel?: string;
  /** What the list announces when it has its options. */
  countLabel?: (count: number) => string;
  /** What the list says when there is no term yet. */
  hint?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  listClassName?: string;
  renderOption?: (option: AdminComboboxOption<TValue>, active: boolean) => ReactNode;
};

type AdminComboboxState<TValue> = {
  term: string;
  status: "loading" | "ready" | "empty" | "error";
  options: AdminComboboxOption<TValue>[];
  message: string;
};

/**
 * A combobox over an async list: a field, the options it loads, the active option, and the
 * announcements a screen reader needs for the loading, empty and error states.
 *
 * The list is the reader's own: the caller decides what an option says and what happens when one
 * is chosen. The primitive owns the keyboard, which is the part a hand-rolled combobox usually
 * gets wrong.
 */
export function AdminCombobox<TValue = unknown>({
  label,
  load,
  onSelect,
  placeholder,
  emptyLabel = "No matches",
  loadingLabel = "Loading",
  errorLabel = "The list could not be loaded",
  retryLabel = "Try again",
  closeLabel = "Close",
  countLabel,
  hint,
  open,
  onOpenChange,
  className,
  listClassName,
  renderOption,
}: AdminComboboxProps<TValue>) {
  const listId = useId();
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open ?? internalOpen;
  const setOpen = (next: boolean) => {
    if (open === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  };
  const [term, setTerm] = useState("");
  const [state, setState] = useState<AdminComboboxState<TValue>>({
    term: "",
    status: "loading",
    options: [],
    message: "",
  });
  const [activeIndex, setActiveIndex] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const trimmed = term.trim();
  // The options on screen are the ones that were loaded for the term on screen. A term that has
  // not been answered yet shows the loading state rather than the previous term's options.
  const current: AdminComboboxState<TValue> = state.term === trimmed
    ? state
    : { term: trimmed, status: "loading", options: [], message: "" };
  const options = current.options;

  useEffect(() => {
    if (!isOpen || !trimmed) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const loaded = await load(trimmed, controller.signal);
        if (controller.signal.aborted) return;
        setState({
          term: trimmed,
          status: loaded.length ? "ready" : "empty",
          options: loaded,
          message: "",
        });
        setActiveIndex(0);
      } catch (error: unknown) {
        if (controller.signal.aborted) return;
        setState({
          term: trimmed,
          status: "error",
          options: [],
          message: error instanceof Error ? error.message : String(error),
        });
      }
    })();
    return () => controller.abort();
  }, [isOpen, trimmed, load, attempt]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  const count = countLabel ?? ((value: number) => `${value}`);
  const announce = !isOpen || !trimmed
    ? ""
    : current.status === "loading"
      ? loadingLabel
      : current.status === "ready"
        ? count(options.length)
        : current.status === "empty"
          ? count(0)
          : current.status === "error"
            ? (current.message || errorLabel)
            : "";

  return (
    <div className={cn("relative", className)}>
      <div className="flex items-center gap-2 border-b border-zinc-200 px-3">
        <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-zinc-400" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label={label}
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls={options.length ? `${listId}-results` : undefined}
          aria-activedescendant={options.length ? `${listId}-result-${activeIndex}` : undefined}
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-400"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setOpen(false);
            } else if (event.key === "ArrowDown" && options.length) {
              event.preventDefault();
              setActiveIndex((activeIndex + 1) % options.length);
            } else if (event.key === "ArrowUp" && options.length) {
              event.preventDefault();
              setActiveIndex((activeIndex - 1 + options.length) % options.length);
            } else if (event.key === "Enter" && options.length) {
              event.preventDefault();
              const option = options[activeIndex];
              if (option) onSelect?.(option);
            }
          }}
        />
        <button
          type="button"
          aria-label={closeLabel}
          onClick={() => setOpen(false)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
      <p role="status" aria-live="polite" className="sr-only">{announce}</p>
      {!trimmed ? (
        <div className="px-4 py-5 text-sm text-zinc-500">{hint}</div>
      ) : current.status === "loading" ? (
        // The loading state is a placeholder rather than the message, because the message is
        // already in the live region: showing it twice would have it read twice.
        <div className="grid gap-2 px-4 py-5">
          <AdminSkeleton className="h-4 w-2/3" />
          <AdminSkeleton className="h-4 w-1/2" />
          <AdminSkeleton className="h-4 w-3/5" />
        </div>
      ) : current.status === "error" ? (
        <div className="px-4 py-5 text-sm text-zinc-600">
          <span role="alert">{errorLabel}</span>
          {current.message ? <p className="mt-2">{current.message}</p> : null}
          <button
            type="button"
            onClick={() => setAttempt((value) => value + 1)}
            className="mt-2 w-fit rounded-lg border border-zinc-300 bg-admin-surface px-3 py-1.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            {retryLabel}
          </button>
        </div>
      ) : options.length ? (
        <ul
          id={`${listId}-results`}
          role="listbox"
          aria-label={label}
          className={cn("max-h-80 overflow-y-auto py-1", listClassName)}
        >
          {options.map((option, index) => (
            <li key={option.id}>
              <div
                id={`${listId}-result-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                onMouseMove={() => setActiveIndex(index)}
                onClick={() => onSelect?.(option)}
                className={cn(
                  "block cursor-pointer border-b border-zinc-100 px-4 py-2.5 last:border-0",
                  index === activeIndex ? "bg-admin-surface-muted" : "hover:bg-admin-surface-muted",
                )}
              >
                {renderOption ? (
                  renderOption(option, index === activeIndex)
                ) : (
                  <>
                    <span className="block truncate text-sm font-medium text-zinc-900">{option.label}</span>
                    {option.description ? (
                      <span className="block truncate text-xs text-zinc-500">{option.description}</span>
                    ) : null}
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4 py-5 text-sm text-zinc-500">{emptyLabel}</p>
      )}
    </div>
  );
}

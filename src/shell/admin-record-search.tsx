// SPDX-License-Identifier: MIT
"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link.js";
import { useRouter } from "next/navigation.js";
import { Search, X } from "lucide-react";
import { adminWidgetBody } from "../widgets/body.js";
import { useAdminWidgetData } from "../widgets/data.js";
import type { AdminWidgetDefinition, AdminWidgetState } from "../widgets/types.js";
import type { AdminRecordSearchResult, AdminSearchAdapter } from "../adapters/search.js";
import { useAdminHref, useAdminMessages } from "../i18n.js";
import { mergeAdminLabels } from "./labels.js";
import type { AdminShellLabels } from "./labels.js";

type RecordSearchData = { term: string; results: AdminRecordSearchResult[] };

export function AdminRecordSearch({
  adapter,
  labels,
}: {
  adapter: AdminSearchAdapter;
  labels?: Partial<AdminShellLabels>;
}) {
  const i18n = useAdminMessages();
  const toHref = useAdminHref();
  const router = useRouter();
  const mergedLabels = mergeAdminLabels({ ...i18n.shell, ...labels });
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeSelection, setActiveSelection] = useState({ term: "", index: 0 });
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const term = query.trim();
  const activeIndex = activeSelection.term === term ? activeSelection.index : 0;
  const searchDefinition = useMemo<AdminWidgetDefinition<RecordSearchData>>(() => ({
    id: "admin-record-search",
    title: mergedLabels.recordSearchLabel,
    sizes: ["sm"],
    render: () => null,
    renderEmpty: () => <p className="px-4 py-5 text-sm text-zinc-500">{mergedLabels.recordSearchNoResults}</p>,
  }), [mergedLabels.recordSearchLabel, mergedLabels.recordSearchNoResults]);
  const load = useCallback(async (signal: AbortSignal): Promise<RecordSearchData> => ({
    term,
    results: await adapter.search(term, signal),
  }), [adapter, term]);
  const { state: loadedState, refetch } = useAdminWidgetData({
    definition: searchDefinition,
    load,
    enabled: open && term.length > 0,
  });
  const state = useMemo<AdminWidgetState<AdminRecordSearchResult[]>>(() => loadedState.status === "ready"
    ? loadedState.data.term === term
      ? loadedState.data.results.length ? { status: "ready", data: loadedState.data.results } : { status: "empty" }
      : { status: "loading" }
    : loadedState, [loadedState, term]);
  const results = state.status === "ready" ? state.data : [];
  const countLabel = mergedLabels.recordSearchResultCount ?? ((count: number) => `${count} results`);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const close = () => {
    setOpen(false);
    setQuery("");
    triggerRef.current?.focus();
  };

  const selectActive = () => {
    const result = results[activeIndex];
    if (!result) return;
    router.push(toHref(result.href));
    close();
  };

  const stateAnnouncement = !open || !term
    ? ""
    : state.status === "loading"
      ? mergedLabels.recordSearchLoading
      : state.status === "ready"
        ? countLabel(results.length)
        : state.status === "empty"
          ? countLabel(0)
          : state.status === "error"
            ? state.error.message
            : "";

  const pendingContent = useMemo(() => {
    const widgetState = state;
    if (widgetState.status === "ready") return null;
    return adminWidgetBody({
      definition: searchDefinition,
      state: widgetState,
      messages: { widget: i18n.widget },
      onRetry: refetch,
      retryIsWorthwhile: () => true,
    });
  }, [i18n.widget, refetch, searchDefinition, state]);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label={mergedLabels.recordSearchOpen}
        aria-expanded={open}
        aria-controls={`${listId}-panel`}
        aria-keyshortcuts="Control+Shift+K Meta+Shift+K"
        title={mergedLabels.recordSearchHint}
        onClick={() => setOpen(true)}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-300 bg-admin-surface text-zinc-600 hover:bg-admin-surface-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
      >
        <Search aria-hidden="true" className="h-4 w-4" />
      </button>
      {open ? (
        <section
          id={`${listId}-panel`}
          aria-label={mergedLabels.recordSearchLabel}
          className="absolute right-0 top-full z-50 mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-zinc-200 bg-admin-surface shadow-xl"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              close();
            } else if (event.key === "ArrowDown" && results.length) {
              event.preventDefault();
              setActiveSelection({ term, index: (activeIndex + 1) % results.length });
            } else if (event.key === "ArrowUp" && results.length) {
              event.preventDefault();
              setActiveSelection({ term, index: (activeIndex - 1 + results.length) % results.length });
            } else if (event.key === "Enter" && results.length) {
              event.preventDefault();
              selectActive();
            }
          }}
        >
          <div className="flex items-center gap-2 border-b border-zinc-200 px-3">
            <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-zinc-400" />
            <input
              ref={inputRef}
              role="combobox"
              aria-label={mergedLabels.recordSearchLabel}
              aria-autocomplete="list"
              aria-expanded={Boolean(term)}
              aria-controls={`${listId}-results`}
              aria-activedescendant={results.length ? `${listId}-result-${activeIndex}` : undefined}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={mergedLabels.recordSearchPlaceholder}
              className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-400"
            />
            <button
              type="button"
              aria-label={mergedLabels.recordSearchClose}
              onClick={close}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
          <p role="status" aria-live="polite" className="sr-only">{stateAnnouncement}</p>
          {!term ? (
            <p className="px-4 py-5 text-sm text-zinc-500">{mergedLabels.recordSearchHint}</p>
          ) : results.length ? (
            <ul id={`${listId}-results`} role="listbox" aria-label={mergedLabels.recordSearchResultsLabel} className="max-h-80 overflow-y-auto py-1">
              {results.map((result, index) => (
                <li key={`${result.resource}:${result.resourceId}`}>
                  <Link
                    id={`${listId}-result-${index}`}
                    role="option"
                    aria-selected={index === activeIndex}
                    href={toHref(result.href)}
                    onClick={close}
                    onMouseMove={() => setActiveSelection({ term, index })}
                    className={`block border-b border-zinc-100 px-4 py-2.5 last:border-0 ${index === activeIndex ? "bg-admin-surface-muted" : "hover:bg-admin-surface-muted"}`}
                  >
                    <span className="block truncate text-sm font-medium text-zinc-900">{result.label}</span>
                    <span className="block truncate text-xs text-zinc-500">{result.resourceLabel} · {result.resourceId}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              {pendingContent}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}

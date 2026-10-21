// SPDX-License-Identifier: MIT
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation.js";
import { Search } from "lucide-react";
import { AdminCombobox } from "../primitives/combobox.js";
import type { AdminComboboxOption } from "../primitives/combobox.js";
import type { AdminRecordSearchResult, AdminSearchAdapter } from "../adapters/search.js";
import { useAdminHref, useAdminMessages } from "../i18n.js";
import { mergeAdminLabels } from "./labels.js";
import type { AdminShellLabels } from "./labels.js";

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
  const triggerRef = useRef<HTMLButtonElement>(null);

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
    triggerRef.current?.focus();
  };

  const load = useCallback(async (
    term: string,
    signal: AbortSignal,
  ): Promise<AdminComboboxOption<AdminRecordSearchResult>[]> => {
    const results = await adapter.search(term, signal);
    return results.map((result) => ({
      id: `${result.resource}:${result.resourceId}`,
      label: result.label,
      description: `${result.resourceLabel} · ${result.resourceId}`,
      value: result,
    }));
  }, [adapter]);

  const countLabel = (count: number) => (count === 1
    ? mergedLabels.recordSearchOneResult
    : mergedLabels.recordSearchManyResults).replace("{count}", String(count));

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label={mergedLabels.recordSearchOpen}
        aria-expanded={open}
        aria-keyshortcuts="Control+Shift+K Meta+Shift+K"
        title={mergedLabels.recordSearchHint}
        onClick={() => setOpen(true)}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-300 bg-admin-surface text-zinc-600 hover:bg-admin-surface-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
      >
        <Search aria-hidden="true" className="h-4 w-4" />
      </button>
      {open ? (
        <section className="absolute right-0 top-full z-50 mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-zinc-200 bg-admin-surface shadow-xl">
          <AdminCombobox
            label={mergedLabels.recordSearchLabel}
            open={open}
            placeholder={mergedLabels.recordSearchPlaceholder}
            hint={mergedLabels.recordSearchHint}
            loadingLabel={mergedLabels.recordSearchLoading}
            emptyLabel={mergedLabels.recordSearchNoResults}
            errorLabel={i18n.widget.errorTitle}
            retryLabel={i18n.widget.retry}
            closeLabel={mergedLabels.recordSearchClose}
            countLabel={countLabel}
            load={load}
            onOpenChange={(next) => { if (!next) close(); }}
            onSelect={(option) => {
              const result = option.value;
              if (!result) return;
              router.push(toHref(result.href));
              close();
            }}
            renderOption={(option) => (
              <>
                <span className="block truncate text-sm font-medium text-zinc-900">{option.label}</span>
                <span className="block truncate text-xs text-zinc-500">{option.description}</span>
              </>
            )}
          />
        </section>
      ) : null}
    </div>
  );
}

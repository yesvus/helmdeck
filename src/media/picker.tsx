// SPDX-License-Identifier: MIT
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, ImagePlus, Play, Search, X } from "lucide-react";
import type {
  AdminMediaAdapter,
  AdminMediaItem,
  AdminMediaKind,
  AdminMediaSource,
} from "../adapters/index.js";
import { Button } from "../primitives/button.js";
import { AdminInput } from "../primitives/input.js";
import {
  AdminModal,
  AdminModalContent,
  AdminModalDescription,
  AdminModalHeader,
  AdminModalTitle,
} from "../primitives/modal.js";
import { AdminSelect } from "../primitives/select.js";
import { AdminMediaPlaceholder } from "./placeholder.js";
import { AdminMediaUpload } from "./upload.js";
import {
  adminMediaSortValues,
  formatMediaSize,
  getAdminMediaThumbnailUrl,
  isPdfMediaItem,
  isVideoMediaItem,
  isYouTubeMediaItem,
  sortAdminMediaItems,
  type AdminMediaSort,
} from "./utils.js";
import { cn } from "../cn.js";
import { defaultAdminMediaLabels, type AdminMediaLabels } from "./labels.js";
import { useAdminMessages } from "../i18n.js";

export type AdminMediaAspectRatio = "4:3" | "16:9" | "21:9";
const DEFAULT_PAGE_SIZE = 48;

export function getMediaAspectRatioClassName(aspectRatio?: AdminMediaAspectRatio) {
  if (aspectRatio === "16:9") return "aspect-video";
  if (aspectRatio === "21:9") return "aspect-[21/9]";
  return "aspect-[4/3]";
}

function mergeItems(current: AdminMediaItem[], incoming: AdminMediaItem[]) {
  const merged = new Map<string, AdminMediaItem>();
  for (const item of [...current, ...incoming]) {
    merged.set(item.path || item.publicUrl, item);
  }
  return [...merged.values()];
}

function matchesAllowedKinds(item: AdminMediaItem, allowedKinds?: AdminMediaKind[]) {
  return !allowedKinds?.length || allowedKinds.includes(item.kind);
}

export function AdminMediaPicker({
  adapter,
  allowExternal = false,
  allowedKinds,
  aspectRatio,
  emptyText,
  items: initialItems = [],
  pageSize = DEFAULT_PAGE_SIZE,
  source,
  labels,
  locale,
  onClose,
  onSelect,
  open,
  title,
}: {
  adapter?: AdminMediaAdapter;
  allowExternal?: boolean;
  allowedKinds?: AdminMediaKind[];
  aspectRatio?: AdminMediaAspectRatio;
  emptyText?: string;
  items?: AdminMediaItem[];
  pageSize?: number;
  source?: AdminMediaSource;
  labels?: Partial<AdminMediaLabels>;
  locale?: string;
  onClose: () => void;
  onSelect: (item: AdminMediaItem) => void;
  open: boolean;
  title: string;
}) {
  const [items, setItems] = useState(initialItems);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<AdminMediaSort>("date-desc");
  const [showUpload, setShowUpload] = useState(false);
  const [nextCursor, setNextCursor] = useState<string>();
  const [total, setTotal] = useState<number>();
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string>();
  const [selectedPath, setSelectedPath] = useState<string>();
  const requestIdRef = useRef(0);
  const initialItemsRef = useRef(initialItems);
  const i18n = useAdminMessages();
  const resolvedLocale = locale ?? i18n.searchLocale;
  const mergedLabels = { ...defaultAdminMediaLabels, ...i18n.media, ...labels };
  const loadErrorLabel = mergedLabels.loadError;
  const resolvedPageSize = Number.isFinite(pageSize) && pageSize > 0
    ? Math.max(1, Math.floor(pageSize))
    : DEFAULT_PAGE_SIZE;

  useEffect(() => {
    initialItemsRef.current = initialItems;
    if (!adapter) {
      setItems(initialItems);
    }
  }, [adapter, initialItems]);

  const loadItems = useCallback(
    async (search: string, cursor?: string) => {
      if (!adapter) {
        return;
      }

      const requestId = ++requestIdRef.current;
      setLoading(true);
      setLoadError(undefined);

      try {
        const kindFilter = allowedKinds?.length === 1
          ? { kind: allowedKinds[0] }
          : allowedKinds?.length
            ? { kinds: allowedKinds }
            : {};
        const result = await adapter.list({
          ...kindFilter,
          cursor,
          limit: resolvedPageSize,
          search: search.trim() || undefined,
          source,
        });
        const resultItems = result.items.filter((item) => matchesAllowedKinds(item, allowedKinds));
        if (requestId !== requestIdRef.current) {
          return;
        }
        setItems((current) => (cursor ? mergeItems(current, resultItems) : resultItems));
        setNextCursor(result.nextCursor);
        setTotal(result.total);
      } catch {
        if (requestId !== requestIdRef.current) {
          return;
        }
        setItems((current) => (cursor ? current : initialItemsRef.current));
        setNextCursor(undefined);
        setLoadError(loadErrorLabel);
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [adapter, allowedKinds, loadErrorLabel, resolvedPageSize, source],
  );

  useEffect(() => {
    if (!open) {
      requestIdRef.current += 1;
      setLoading(false);
      return;
    }
    void loadItems(query);
  }, [loadItems, open, query]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setQuery("");
    setSort("date-desc");
    setSelectedPath(undefined);
    setShowUpload(false);
    setNextCursor(undefined);
    setTotal(undefined);
    setLoadError(undefined);
  }, [open, title]);

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase(resolvedLocale);
    const matched = normalized
      ? items.filter((item) =>
          matchesAllowedKinds(item, allowedKinds) &&
          `${item.name} ${item.path} ${item.publicUrl} ${item.contentType ?? ""}`
            .toLocaleLowerCase(resolvedLocale)
            .includes(normalized),
        )
      : items.filter((item) => matchesAllowedKinds(item, allowedKinds));
    return sortAdminMediaItems(matched, sort, resolvedLocale);
  }, [allowedKinds, items, query, resolvedLocale, sort]);

  return (
    <AdminModal open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <AdminModalContent className="flex max-h-[90vh] max-w-6xl flex-col gap-0 overflow-hidden p-0">
        <AdminModalHeader className="border-b border-zinc-200 bg-admin-surface px-5 py-5 pr-14 sm:px-7">
          <AdminModalTitle className="text-xl font-bold text-zinc-900">{title}</AdminModalTitle>
          <AdminModalDescription>{mergedLabels.description}</AdminModalDescription>
          {aspectRatio ? (
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              {mergedLabels.recommendedRatio}: {aspectRatio}
            </p>
          ) : null}
        </AdminModalHeader>
        <div className="space-y-3 border-b border-zinc-200 bg-zinc-50/80 px-5 py-4 sm:px-7">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <AdminInput
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={mergedLabels.searchPlaceholder}
              aria-label={mergedLabels.searchLabel}
              className="pl-9"
            />
          </label>
          <AdminSelect value={sort} onChange={(event) => setSort(event.target.value as AdminMediaSort)} aria-label={mergedLabels.sortLabel}>
            {adminMediaSortValues.map((option) => (
              <option key={option} value={option}>{i18n.mediaSort[option]}</option>
            ))}
          </AdminSelect>
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-zinc-500" aria-live="polite">
              {filteredItems.length} {mergedLabels.results}
            </p>
            {adapter ? (
              <Button type="button" variant="ghost" className="h-8 px-2 text-xs text-zinc-600" aria-expanded={showUpload} onClick={() => setShowUpload((value) => !value)}>
                <ImagePlus className="h-4 w-4" />
                {showUpload ? mergedLabels.hideUpload : mergedLabels.upload}
              </Button>
            ) : null}
          </div>
        </div>
        {showUpload && adapter ? (
          <div className="relative border-b border-zinc-200 bg-admin-surface p-3 pr-12 sm:p-4">
            <button type="button" aria-label="Close upload panel" onClick={() => setShowUpload(false)} className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100"><X className="h-4 w-4" /></button>
            <AdminMediaUpload
              allowExternal={allowExternal}
              compact
              adapter={adapter}
              labels={mergedLabels}
              onUploaded={(item) => {
                if (matchesAllowedKinds(item, allowedKinds)) {
                  setItems((current) => [item, ...current]);
                }
              }}
            />
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:px-7" aria-busy={loading}>
          {loadError ? <div role="alert" className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><span>{loadError}</span><Button type="button" variant="outline" onClick={() => void loadItems(query)}>{mergedLabels.retry}</Button></div> : null}
          {loading && !items.length ? (
            <p role="status" className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-5 py-14 text-center text-sm text-zinc-500">
              {mergedLabels.loading}
            </p>
          ) : filteredItems.length ? (
            <>
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {filteredItems.map((item) => {
                const thumbnail = getAdminMediaThumbnailUrl(item);
                const video = isYouTubeMediaItem(item) || isVideoMediaItem(item);
                return (
                  <button
                    key={item.path}
                    type="button"
                    onClick={() => { setSelectedPath(item.path); onSelect(item); }}
                    aria-pressed={selectedPath === item.path}
                    className={cn("group overflow-hidden rounded-xl border bg-admin-surface text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 hover:border-zinc-400 hover:shadow-md", selectedPath === item.path ? "border-brand-600 ring-2 ring-brand-500/20" : "border-zinc-200")}
                  >
                    <div className={cn("relative flex items-center justify-center overflow-hidden bg-zinc-100", getMediaAspectRatioClassName(aspectRatio))}>
                      {thumbnail ? (
                        <div
                          role="img"
                          aria-label={item.name}
                          className="h-full w-full bg-cover bg-center transition duration-300 group-hover:scale-[1.03]"
                          style={{ backgroundImage: `url("${thumbnail.replaceAll('"', "%22")}")` }}
                        />
                      ) : (
                        <AdminMediaPlaceholder kind={isPdfMediaItem(item) ? "pdf" : video ? "video" : item.source === "external" ? "external" : "image"} label={item.name} />
                      )}
                      {video ? (
                        <span className="absolute inset-0 flex items-center justify-center bg-black/20 text-white">
                          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/55">
                            <Play className="ml-0.5 h-5 w-5 fill-current" />
                          </span>
                        </span>
                      ) : null}
                      {selectedPath === item.path ? <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-white"><Check className="h-4 w-4" /></span> : null}
                    </div>
                    <div className="space-y-1 px-3 py-3">
                      <p className="truncate text-sm font-semibold text-zinc-900">{item.name}</p>
                      <p className="truncate text-xs font-medium uppercase tracking-wider text-zinc-500">
                        {item.kind}{item.size ? ` · ${formatMediaSize(item.size)}` : ""}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
            {selectedPath ? (() => {
              const index = filteredItems.findIndex((item) => item.path === selectedPath);
              const selected = filteredItems[index];
              return selected ? <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-admin-surface p-3" aria-live="polite">
                <Button type="button" variant="outline" aria-label="Previous media" disabled={index <= 0} onClick={() => { const item = filteredItems[index - 1]; if (item) { setSelectedPath(item.path); onSelect(item); } }}><ChevronLeft className="h-4 w-4" /><span className="sr-only">Previous</span></Button>
                <div className="hidden h-14 w-20 shrink-0 overflow-hidden rounded bg-zinc-100 sm:block">{getAdminMediaThumbnailUrl(selected) ? <div role="img" aria-label={selected.name} className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url("${getAdminMediaThumbnailUrl(selected).replaceAll('"', "%22")}")` }} /> : <AdminMediaPlaceholder kind={isPdfMediaItem(selected) ? "pdf" : isVideoMediaItem(selected) ? "video" : "image"} label={selected.name} />}</div>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{selected.name}</p><p className="text-xs text-zinc-500">{selected.kind}{selected.size ? ` · ${formatMediaSize(selected.size)}` : ""}</p></div>
                <Button type="button" variant="outline" aria-label="Next media" disabled={index >= filteredItems.length - 1} onClick={() => { const item = filteredItems[index + 1]; if (item) { setSelectedPath(item.path); onSelect(item); } }}><ChevronRight className="h-4 w-4" /><span className="sr-only">Next</span></Button>
              </div> : null;
            })() : null}
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-5 py-14 text-center text-sm text-zinc-500">
              {emptyText ?? mergedLabels.empty}
            </div>
          )}
          {nextCursor && !loading ? (
            <div className="mt-5 flex justify-center">
              <Button type="button" variant="outline" onClick={() => void loadItems(query, nextCursor)}>
                {mergedLabels.loadMore}
              </Button>
            </div>
          ) : null}
          {typeof total === "number" ? <p className="sr-only">{total}</p> : null}
        </div>
      </AdminModalContent>
    </AdminModal>
  );
}

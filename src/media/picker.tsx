// SPDX-License-Identifier: MIT
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Play, Search } from "lucide-react";
import type {
  AdminMediaAdapter,
  AdminMediaItem,
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

export function AdminMediaPicker({
  adapter,
  allowExternal = false,
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
  const requestIdRef = useRef(0);
  const initialItemsRef = useRef(initialItems);
  const i18n = useAdminMessages();
  const resolvedLocale = locale ?? i18n.searchLocale;
  const mergedLabels = { ...defaultAdminMediaLabels, ...i18n.media, ...labels };
  const loadErrorLabel = mergedLabels.loadError;
  const resolvedPageSize = Math.max(1, Math.floor(pageSize));

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
        const result = await adapter.list({
          cursor,
          limit: resolvedPageSize,
          search: search.trim() || undefined,
          source,
        });
        if (requestId !== requestIdRef.current) {
          return;
        }
        setItems((current) => (cursor ? mergeItems(current, result.items) : result.items));
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
    [adapter, loadErrorLabel, resolvedPageSize, source],
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
    setShowUpload(false);
    setNextCursor(undefined);
    setTotal(undefined);
    setLoadError(undefined);
  }, [open, title]);

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase(resolvedLocale);
    const matched = normalized
      ? items.filter((item) =>
          `${item.name} ${item.path} ${item.publicUrl} ${item.contentType ?? ""}`
            .toLocaleLowerCase(resolvedLocale)
            .includes(normalized),
        )
      : items;
    return sortAdminMediaItems(matched, sort, resolvedLocale);
  }, [items, query, resolvedLocale, sort]);

  return (
    <AdminModal open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <AdminModalContent className="flex max-h-[90vh] max-w-6xl flex-col gap-0 overflow-hidden p-0">
        <AdminModalHeader className="border-b border-zinc-200 px-5 py-5 pr-14">
          <AdminModalTitle className="text-xl text-zinc-900">{title}</AdminModalTitle>
          <AdminModalDescription>{mergedLabels.description}</AdminModalDescription>
          {aspectRatio ? (
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              {mergedLabels.recommendedRatio}: {aspectRatio}
            </p>
          ) : null}
        </AdminModalHeader>
        <div className="flex flex-col gap-3 border-b border-zinc-200 bg-zinc-50 px-5 py-4 sm:flex-row sm:items-center">
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
          {adapter ? (
            <Button type="button" variant="outline" onClick={() => setShowUpload((value) => !value)}>
              <ImagePlus className="h-4 w-4" />
              {showUpload ? mergedLabels.hideUpload : mergedLabels.upload}
            </Button>
          ) : null}
        </div>
        {showUpload && adapter ? (
          <div className="border-b border-zinc-200 bg-white p-4">
            <AdminMediaUpload
              allowExternal={allowExternal}
              compact
              adapter={adapter}
              labels={mergedLabels}
              onUploaded={(item) => setItems((current) => [item, ...current])}
            />
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto p-5" aria-busy={loading}>
          {loadError ? <p role="alert" className="mb-4 text-sm text-red-600">{loadError}</p> : null}
          {loading && !items.length ? (
            <p role="status" className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-5 py-14 text-center text-sm text-zinc-500">
              {mergedLabels.loading}
            </p>
          ) : filteredItems.length ? (
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
              {filteredItems.map((item) => {
                const thumbnail = getAdminMediaThumbnailUrl(item);
                const video = isYouTubeMediaItem(item) || isVideoMediaItem(item);
                return (
                  <button
                    key={item.path}
                    type="button"
                    onClick={() => onSelect(item)}
                    className="group overflow-hidden rounded-xl border border-zinc-200 bg-white text-left transition hover:-translate-y-0.5 hover:border-zinc-400 hover:shadow-lg"
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
                        <AdminMediaPlaceholder kind={isPdfMediaItem(item) ? "pdf" : "image"} label={item.name} />
                      )}
                      {video ? (
                        <span className="absolute inset-0 flex items-center justify-center bg-black/20 text-white">
                          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/55">
                            <Play className="ml-0.5 h-5 w-5 fill-current" />
                          </span>
                        </span>
                      ) : null}
                    </div>
                    <div className="space-y-1 px-3 py-3">
                      <p className="truncate text-sm font-semibold text-zinc-900">{item.name}</p>
                      <p className="truncate text-xs uppercase tracking-wider text-zinc-400">
                        {item.kind}{item.size ? ` · ${formatMediaSize(item.size)}` : ""}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
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

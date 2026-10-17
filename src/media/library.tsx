// SPDX-License-Identifier: MIT
/**
 * The media library: what a site has uploaded, and the four things an operator does with it.
 *
 * The package already ships the media field, the picker and the upload control, so what a host was
 * left rebuilding was the page around them: a browsable list, an upload that lands in it, a preview,
 * and a delete. This is that page, and it reads and writes through `AdminMediaAdapter` only. It holds
 * no store of its own, so a host with a bucket, a CDN or a database answers every call the same way.
 *
 * Two rules about delete, because a library is the one surface where a wrong click is unrecoverable.
 * The control is offered only for assets this library could actually remove, which by default means
 * the ones stored here rather than a YouTube video or somebody else's URL, and only when the adapter
 * has a `delete` at all. What the adapter then says is the decision: this component hides controls,
 * it does not authorize.
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Play, Trash2, X } from "lucide-react";
import type {
  AdminMediaAdapter,
  AdminMediaItem,
  AdminMediaKind,
  AdminMediaSource,
  AdminPermission,
} from "../adapters/index.js";
import { useAdminMessages } from "../i18n.js";
import { Button } from "../primitives/button.js";
import { AdminDestructiveAction } from "../primitives/destructive-action.js";
import { AdminEmptyState } from "../primitives/empty-state.js";
import { AdminInput } from "../primitives/input.js";
import { AdminSelect } from "../primitives/select.js";
import { AdminSurfaceCard } from "../primitives/layout.js";
import { useAdminPermission } from "../shell/permissions.js";
import { defaultAdminMediaLabels, type AdminMediaLabels } from "./labels.js";
import { AdminMediaLightbox, type AdminMediaLightboxImage } from "./lightbox.js";
import { AdminMediaPlaceholder } from "./placeholder.js";
import { AdminMediaUpload } from "./upload.js";
import {
  adminMediaSortValues,
  formatMediaSize,
  getAdminMediaThumbnailUrl,
  isImageMediaItem,
  isPdfMediaItem,
  isVideoMediaItem,
  isYouTubeMediaItem,
  sortAdminMediaItems,
  type AdminMediaSort,
} from "./utils.js";

const DEFAULT_PAGE_SIZE = 24;

/** The assets this library could remove: the ones it stores, and only when the adapter can delete. */
export function adminMediaDeletableItem(item: AdminMediaItem, adapter?: AdminMediaAdapter): boolean {
  if (!adapter?.delete) return false;
  return item.source === "uploaded" || item.source === "local";
}

function mergeItems(current: AdminMediaItem[], incoming: AdminMediaItem[]): AdminMediaItem[] {
  const byPath = new Map(current.map((item) => [item.path, item]));
  for (const item of incoming) byPath.set(item.path, item);
  return [...byPath.values()];
}

/**
 * A URL this page is willing to put in an `href`, or null when it is not one.
 *
 * A stored URL is data, and a `javascript:` one handed to a link runs when an operator clicks the
 * asset they were looking at. Only http(s) and this site's own root-relative paths are navigable
 * here; anything else is rendered inert with the reason on the link, which is a host's store to fix
 * rather than something to silently follow.
 */
function navigableUrl(value: string): string | null {
  const trimmed = value.trim();
  const rootRelative = trimmed.startsWith("/") && !trimmed.startsWith("//");
  if (!rootRelative && !/^https?:\/\//i.test(trimmed)) return null;
  try {
    const parsed = new URL(trimmed, "https://helmdeck.invalid");
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    if (rootRelative && parsed.origin !== "https://helmdeck.invalid") return null;
    return rootRelative ? `${parsed.pathname}${parsed.search}${parsed.hash}` : parsed.toString();
  } catch {
    return null;
  }
}

export type AdminMediaLibraryProps = {
  /** The store. Without it there is nothing to browse, and the page says so rather than showing an empty grid. */
  adapter?: AdminMediaAdapter;
  /** The assets, when a host has already resolved them and has no adapter to read through. */
  items?: AdminMediaItem[];
  allowedKinds?: AdminMediaKind[];
  source?: AdminMediaSource;
  /** What the file picker offers, as an `accept` attribute. A host that stores one kind of file states it here. */
  accept?: string;
  pageSize?: number;
  /** The rule that decides whether this session may upload. It gates the control, nothing else. */
  uploadPermission?: AdminPermission;
  /** The rule that decides whether this session may delete. Same: it gates the control, nothing else. */
  deletePermission?: AdminPermission;
  /** Replaces the default of "stored here and removable", for a host with its own policy. */
  deletable?: (item: AdminMediaItem) => boolean;
  labels?: Partial<AdminMediaLabels>;
  locale?: string;
  onDeleted?: (item: AdminMediaItem) => void;
  onSelected?: (item: AdminMediaItem) => void;
};

export function AdminMediaLibrary({
  adapter,
  items: initialItems,
  allowedKinds,
  source,
  accept,
  pageSize = DEFAULT_PAGE_SIZE,
  uploadPermission,
  deletePermission,
  deletable,
  labels,
  locale,
  onDeleted,
  onSelected,
}: AdminMediaLibraryProps) {
  const i18n = useAdminMessages();
  const mergedLabels = { ...defaultAdminMediaLabels, ...i18n.media, ...labels };
  const resolvedLocale = locale ?? i18n.searchLocale;
  const initialItemsRef = useRef(initialItems);
  const requestIdRef = useRef(0);
  const [adapterItems, setAdapterItems] = useState<AdminMediaItem[]>(initialItems ?? []);
  const [showingFallbackItems, setShowingFallbackItems] = useState(Boolean(initialItems));
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<AdminMediaSort>("date-desc");
  const [kind, setKind] = useState<AdminMediaKind | "">("");
  const [showUpload, setShowUpload] = useState(false);
  const [nextCursor, setNextCursor] = useState<string>();
  const [total, setTotal] = useState<number>();
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string>();
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<string>();
  const [deleteError, setDeleteError] = useState<string>();
  const [deleted, setDeleted] = useState<string>();

  useEffect(() => {
    initialItemsRef.current = initialItems;
  }, [initialItems]);

  const uploadAllowed = useAdminPermission(uploadPermission) === "allowed";
  const deleteAllowed = useAdminPermission(deletePermission) === "allowed";
  // Without an adapter the prop is the source of truth, so it is derived rather than mirrored into
  // state. Memoised because a caller writing `items={[...]}` inline would otherwise hand the sort
  // below a new array on every render.
  const items = useMemo(() => (adapter ? adapterItems : (initialItems ?? [])), [adapter, adapterItems, initialItems]);
  const resolvedPageSize =
    Number.isFinite(pageSize) && pageSize > 0 ? Math.max(1, Math.floor(pageSize)) : DEFAULT_PAGE_SIZE;
  // Compared by value, because a host writing `allowedKinds={["image"]}` inline hands a new array on
  // every render, and a loader keyed on that identity would ask its store again every render.
  const allowedKindsKey = allowedKinds?.join(",") ?? "";
  const stableAllowedKinds = useMemo(
    () => (allowedKindsKey ? (allowedKindsKey.split(",") as AdminMediaKind[]) : undefined),
    [allowedKindsKey],
  );

  const canDelete = useCallback(
    (item: AdminMediaItem) =>
      Boolean(adapter?.delete) && deleteAllowed && (deletable?.(item) ?? adminMediaDeletableItem(item, adapter)),
    [adapter, deleteAllowed, deletable],
  );

  const loadItems = useCallback(
    async (search: string, nextKind: AdminMediaKind | "", cursor?: string) => {
      if (!adapter) return;
      const requestId = ++requestIdRef.current;
      setLoading(true);
      setLoadError(undefined);
      if (!cursor) {
        setAdapterItems([]);
        setShowingFallbackItems(false);
        setNextCursor(undefined);
        setTotal(undefined);
      }

      try {
        const result = await adapter.list({
          ...(nextKind ? { kind: nextKind } : {}),
          ...(stableAllowedKinds?.length ? { kinds: stableAllowedKinds } : {}),
          cursor,
          limit: resolvedPageSize,
          search: search.trim() || undefined,
          source,
        });
        // A request the reader has already moved past must not write into the list.
        if (requestId !== requestIdRef.current) return;
        setAdapterItems((current) => (cursor ? mergeItems(current, result.items) : result.items));
        setShowingFallbackItems(false);
        setNextCursor(result.nextCursor);
        setTotal(result.total);
      } catch {
        if (requestId !== requestIdRef.current) return;
        if (!cursor) {
          setAdapterItems(initialItemsRef.current ?? []);
          setShowingFallbackItems(Boolean(initialItemsRef.current?.length));
        }
        // A page that failed keeps its cursor: dropping it would take away the reader's only way to
        // ask for that same page again, over a failure that was theirs and not the store's answer.
        if (!cursor) setNextCursor(undefined);
        setLoadError(mergedLabels.loadError);
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    },
    [adapter, resolvedPageSize, source, stableAllowedKinds, mergedLabels.loadError],
  );

  // This effect owns the library's data lifecycle: it reads on mount, on every change of the search
  // or kind filter, and cancels work in flight when the reader moves on to another one.
  /* eslint-disable react-hooks/set-state-in-effect -- external data fetch lifecycle */
  useEffect(() => {
    void loadItems(query, kind);
  }, [loadItems, query, kind]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const visible = useMemo(() => {
    // Sorting here rather than in the adapter: the adapter's contract is a page of what matched, and
    // the order a person reads a grid in is the same decision whichever page it came from.
    const allowed = stableAllowedKinds?.length
      ? items.filter((item) => stableAllowedKinds.includes(item.kind))
      : items;
    // The kind and source a reader narrowed by are applied here as well as in the query, because
    // without an adapter the query never reaches a store that would have applied them.
    const scoped = kind ? allowed.filter((item) => item.kind === kind) : allowed;
    const narrowed = source ? scoped.filter((item) => item.source === source) : scoped;
    const normalized = query.trim().toLocaleLowerCase(resolvedLocale);
    // With an adapter the store has already searched; doing it again here would drop rows a store
    // matched on a field this does not know about.
    const matched =
      (adapter && !showingFallbackItems) || normalized === ""
        ? narrowed
        : narrowed.filter((item) =>
            `${item.name} ${item.path} ${item.contentType ?? ""}`
              .toLocaleLowerCase(resolvedLocale)
              .includes(normalized),
          );
    return sortAdminMediaItems(matched, sort, resolvedLocale);
  }, [adapter, items, kind, query, resolvedLocale, showingFallbackItems, sort, source, stableAllowedKinds]);

  const previewable = visible.filter((item) => isImageMediaItem(item));
  const previewImages: AdminMediaLightboxImage[] = previewable.map((item) => ({
    src: item.publicUrl,
    alt: item.defaultAltText || item.name,
  }));

  if (!adapter && !initialItems) {
    return (
      <AdminSurfaceCard>
        <p role="status" className="p-5 text-sm text-zinc-600 dark:text-zinc-400">
          {mergedLabels.libraryUnavailable}
        </p>
      </AdminSurfaceCard>
    );
  }

  async function remove(item: AdminMediaItem) {
    if (!adapter?.delete) return;
    setDeleting(item.path);
    setDeleteError(undefined);
    try {
      await adapter.delete(item);
      setAdapterItems((current) => current.filter((current_item) => current_item.path !== item.path));
      // The footer counts what the store holds, so a total left where it was would report one more
      // asset than the grid shows, for as long as the page stays open.
      setTotal((current) => (typeof current === "number" ? Math.max(0, current - 1) : current));
      setDeleted(item.name);
      onDeleted?.(item);
    } catch {
      // The row stays where it is: a delete the store refused has not happened, and a library that
      // dropped it anyway would be reporting a change it cannot point at.
      setDeleteError(mergedLabels.deleteFailed);
    } finally {
      setDeleting(undefined);
    }
  }

  return (
    <div className="space-y-4">
      <AdminSurfaceCard>
        <div className="flex flex-col gap-3 border-b border-zinc-200 bg-zinc-50/80 px-5 py-4 lg:flex-row lg:items-center">
          <AdminInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={mergedLabels.searchPlaceholder}
            aria-label={mergedLabels.searchLabel}
          />
          <AdminSelect
            className="lg:w-52"
            value={kind}
            onChange={(event) => setKind(event.target.value as AdminMediaKind | "")}
            aria-label={mergedLabels.kindFilter}
          >
            <option value="">{mergedLabels.allKinds}</option>
            {(allowedKinds ?? ["image", "video", "pdf", "youtube"]).map((value) => (
              <option key={value} value={value}>
                {mergedLabels.kinds[value]}
              </option>
            ))}
          </AdminSelect>
          <AdminSelect
            className="lg:w-52"
            value={sort}
            onChange={(event) => setSort(event.target.value as AdminMediaSort)}
            aria-label={mergedLabels.sortLabel}
          >
            {adminMediaSortValues.map((option) => (
              <option key={option} value={option}>
                {i18n.mediaSort[option]}
              </option>
            ))}
          </AdminSelect>
          {adapter && uploadAllowed ? (
            <Button type="button" variant="ghost" className="h-8 px-2 text-xs text-zinc-600 lg:ml-auto" aria-expanded={showUpload} onClick={() => setShowUpload((value) => !value)}>
              <ImagePlus className="h-4 w-4" />
              {showUpload ? mergedLabels.hideUpload : mergedLabels.upload}
            </Button>
          ) : null}
        </div>

        {showUpload && adapter && uploadAllowed ? (
          <div className="relative border-b border-zinc-200 bg-admin-surface p-4 pr-14">
            <button type="button" aria-label={mergedLabels.closeUpload} onClick={() => setShowUpload(false)} className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100">
              <X className="h-4 w-4" />
            </button>
            <AdminMediaUpload
              accept={accept}
              allowExternal={Boolean(adapter.addExternal)}
              compact
              adapter={adapter}
              labels={mergedLabels}
              onUploaded={(item) => {
                // Existing list first, so an upload that lands on a path already in the grid replaces
                // the stale record rather than being shadowed by it.
                if (!source || item.source === source) {
                  const isNew = !adapterItems.some((current) => current.path === item.path);
                  setAdapterItems((current) => mergeItems(current, [item]));
                  if (isNew) setTotal((current) => (typeof current === "number" ? current + 1 : current));
                }
                setDeleted(undefined);
              }}
            />
          </div>
        ) : null}

        <div className="space-y-3 p-5" aria-busy={loading}>
          {loadError ? (
            <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <span>{loadError}</span>
              <Button type="button" variant="outline" onClick={() => void loadItems(query, kind)}>
                {mergedLabels.retry}
              </Button>
            </div>
          ) : null}
          {deleteError ? (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {deleteError}
            </p>
          ) : null}
          {deleted && !deleteError ? (
            <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {mergedLabels.deleted}: {deleted}
            </p>
          ) : null}

          {loading && !visible.length ? (
            <p role="status" className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-5 py-14 text-center text-sm text-zinc-500">
              {mergedLabels.loading}
            </p>
          ) : visible.length ? (
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visible.map((item) => {
                const thumbnail = getAdminMediaThumbnailUrl(item);
                const video = isYouTubeMediaItem(item) || isVideoMediaItem(item);
                const image = isImageMediaItem(item);
                const previewAt = previewable.findIndex((candidate) => candidate.path === item.path);
                return (
                  <li key={item.path} className="overflow-hidden rounded-xl border border-zinc-200 bg-admin-surface">
                    {image ? (
                      <button
                        type="button"
                        onClick={() => {
                          setPreviewIndex(previewAt);
                          onSelected?.(item);
                        }}
                        aria-label={`${mergedLabels.preview ?? mergedLabels.select}: ${item.name}`}
                        className="group relative block w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                      >
                        <MediaThumbnail item={item} thumbnail={thumbnail} video={video} />
                      </button>
                    ) : navigableUrl(item.publicUrl) ? (
                      <a
                        href={navigableUrl(item.publicUrl) ?? undefined}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`${mergedLabels.libraryOpen}: ${item.name}`}
                        onClick={() => onSelected?.(item)}
                        className="group relative block w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                      >
                        <MediaThumbnail item={item} thumbnail={thumbnail} video={video} />
                      </a>
                    ) : (
                      // Not an anchor at all: an `<a>` without an href is still announced as a link by
                      // some readers, and the one thing this must not be is a control that goes nowhere.
                      <div className="group relative block w-full">
                        <MediaThumbnail item={item} thumbnail={thumbnail} video={video} />
                        <span className="sr-only">{mergedLabels.libraryNotNavigable}</span>
                      </div>
                    )}
                    <div className="space-y-2 px-3 py-3">
                      <p className="truncate text-sm font-semibold text-zinc-900">{item.name}</p>
                      <p className="truncate text-xs font-medium uppercase tracking-wider text-zinc-500">
                        {mergedLabels.kinds[item.kind]}
                        {item.size ? ` · ${formatMediaSize(item.size)}` : ""}
                      </p>
                      {canDelete(item) ? (
                        <AdminDestructiveAction
                          buttonText={mergedLabels.delete}
                          title={mergedLabels.deleteTitle}
                          description={mergedLabels.deleteDescription}
                          confirmLabel={mergedLabels.deleteConfirm}
                          busyLabel={mergedLabels.deleteBusy}
                          triggerAriaLabel={`${mergedLabels.delete}: ${item.name}`}
                          triggerVariant="ghost"
                          triggerClassName="h-7 px-2 text-xs text-red-700"
                          buttonClassName="h-7 px-2 text-xs"
                          icon={<Trash2 className="h-4 w-4" />}
                          onConfirm={() => remove(item)}
                        />
                      ) : null}
                      {deleting === item.path ? (
                        <span className="sr-only" role="status">
                          {mergedLabels.deleteBusy}
                        </span>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-5 py-14">
              <AdminEmptyState title={mergedLabels.empty} body={mergedLabels.libraryEmptyBody} />
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-1">
            <p className="text-sm font-medium text-zinc-600" aria-live="polite">
              {visible.length} {mergedLabels.results}
              {typeof total === "number" ? ` · ${total} ${mergedLabels.total}` : ""}
            </p>
            {nextCursor && !loading ? (
              <Button type="button" variant="outline" onClick={() => void loadItems(query, kind, nextCursor)}>
                {mergedLabels.loadMore}
              </Button>
            ) : null}
          </div>
        </div>
      </AdminSurfaceCard>

      <AdminMediaLightbox
        images={previewImages}
        index={previewIndex ?? 0}
        open={previewIndex !== null}
        title={previewIndex === null ? "" : (previewable[previewIndex]?.name ?? "")}
        labels={mergedLabels}
        onClose={() => setPreviewIndex(null)}
        onIndexChange={setPreviewIndex}
      />
    </div>
  );
}

/** One grid cell's picture: a thumbnail when there is one, and a placeholder naming the kind when there is not. */
function MediaThumbnail({
  item,
  thumbnail,
  video,
}: {
  item: AdminMediaItem;
  thumbnail: string;
  video: boolean;
}) {
  return (
    <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-zinc-100">
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
        <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center bg-black/20">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/55">
            <Play className="ml-0.5 h-5 w-5 fill-current text-white" />
          </span>
        </span>
      ) : null}
    </div>
  );
}

export type AdminMediaLibraryPageProps = AdminMediaLibraryProps & {
  /** The heading. Falls back to the media label the shell already has. */
  title?: string;
  description?: string;
};

/**
 * The whole page: a heading, then the library.
 *
 * A host that already has a page to put assets in mounts `AdminMediaLibrary` inside it. This is the
 * other half: the route a host adds when it has no reason to design one, so a media library is a link
 * rather than a project.
 */
export function AdminMediaLibraryPage({ title, description, ...library }: AdminMediaLibraryPageProps) {
  const i18n = useAdminMessages();
  const mergedLabels = { ...defaultAdminMediaLabels, ...i18n.media, ...library.labels };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">{title ?? mergedLabels.libraryTitle}</h1>
        <p className="mt-1 text-sm text-zinc-500">{description ?? mergedLabels.libraryDescription}</p>
      </header>
      <AdminMediaLibrary {...library} />
    </div>
  );
}

// SPDX-License-Identifier: MIT
"use client";

import { useMemo, useState } from "react";
import { ImagePlus, Play, Trash2 } from "lucide-react";
import type { AdminMediaAdapter, AdminMediaItem, AdminMediaKind } from "../adapters/index.js";
import { Button } from "../primitives/button.js";
import { AdminField } from "../primitives/field.js";
import { useAdminFormValueSignal } from "../primitives/managed-form.js";
import { AdminMediaPlaceholder } from "./placeholder.js";
import {
  AdminMediaPicker,
  getMediaAspectRatioClassName,
  type AdminMediaAspectRatio,
} from "./picker.js";
import {
  getAdminMediaThumbnailUrl,
  isImageMediaItem,
  isImageMediaUrl,
  isPdfMediaItem,
  isPdfMediaUrl,
  isVideoMediaUrl,
  isVisualMediaItem,
  isYouTubeMediaItem,
} from "./utils.js";
import { cn } from "../cn.js";
import { defaultAdminMediaLabels, type AdminMediaLabels } from "./labels.js";
import { useAdminMessages } from "../i18n.js";

export type AdminMediaPickerMode = "image" | "file" | "pdf" | "visual";

function filterItems(items: AdminMediaItem[], mode: AdminMediaPickerMode) {
  if (mode === "image") return items.filter(isImageMediaItem);
  if (mode === "pdf") return items.filter(isPdfMediaItem);
  if (mode === "visual") return items.filter(isVisualMediaItem);
  return items;
}

export function AdminMediaAspectRatioHint({
  aspectRatio,
}: {
  aspectRatio?: AdminMediaAspectRatio;
}) {
  const i18n = useAdminMessages();
  if (!aspectRatio) return null;

  return (
    <p className="mb-3 inline-flex rounded-full bg-zinc-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-600">
      {i18n.media.recommendedRatio}: {aspectRatio}
    </p>
  );
}

export function AdminMediaField({
  adapter,
  allowExternal = false,
  aspectRatio = "4:3",
  defaultValue,
  hint,
  items,
  label,
  labels,
  locale,
  mode = "image",
  name,
  onValueChange,
}: {
  adapter?: AdminMediaAdapter;
  allowExternal?: boolean;
  aspectRatio?: AdminMediaAspectRatio;
  defaultValue?: string | null;
  hint?: string;
  items: AdminMediaItem[];
  label: string;
  labels?: Partial<AdminMediaLabels>;
  locale?: string;
  mode?: AdminMediaPickerMode;
  name: string;
  onValueChange?: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(defaultValue ?? "");
  const i18n = useAdminMessages();
  const mergedLabels = { ...defaultAdminMediaLabels, ...i18n.media, ...labels };
  const hiddenValueRef = useAdminFormValueSignal<HTMLInputElement>(value, {
    name,
    restore: setValue,
  });
  const availableItems = useMemo(() => filterItems(items, mode), [items, mode]);
  const allowedKinds = useMemo<AdminMediaKind[]>(() => {
    if (mode === "image") return ["image"];
    if (mode === "pdf") return ["pdf"];
    if (mode === "visual") return ["image", "video", "youtube"];
    return [];
  }, [mode]);
  const selectedItem = items.find((item) => item.publicUrl === value) ?? null;
  const youtubeThumbnail = selectedItem && isYouTubeMediaItem(selectedItem)
    ? getAdminMediaThumbnailUrl(selectedItem)
    : "";
  const imagePreview = selectedItem && isImageMediaItem(selectedItem)
    ? selectedItem.publicUrl
    : !selectedItem && value && isImageMediaUrl(value)
      ? value
      : "";
  const videoPreview = !youtubeThumbnail && value && isVideoMediaUrl(value);

  function updateValue(nextValue: string) {
    setValue(nextValue);
    onValueChange?.(nextValue);
  }

  return (
    <>
      <AdminField label={label} hint={hint}>
        <input ref={hiddenValueRef} type="hidden" name={name} value={value} />
        <AdminMediaAspectRatioHint aspectRatio={aspectRatio} />
        <div className="rounded-lg border border-zinc-200 bg-admin-surface p-4">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={cn(
              "block w-full max-w-sm overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 text-left transition hover:border-zinc-400",
              !value && "border-dashed",
            )}
          >
            <div className={cn("relative w-full", getMediaAspectRatioClassName(aspectRatio))}>
              {youtubeThumbnail || imagePreview ? (
                <div
                  role="img"
                  aria-label={selectedItem?.name ?? label}
                  className="h-full w-full bg-cover bg-center"
                  style={{ backgroundImage: `url("${(youtubeThumbnail || imagePreview).replaceAll('"', "%22")}")` }}
                />
              ) : videoPreview ? (
                <video src={value} controls preload="metadata" className="h-full w-full bg-admin-media-backdrop object-contain" />
              ) : (
                <AdminMediaPlaceholder kind={value && isPdfMediaUrl(value) ? "pdf" : "image"} />
              )}
              {youtubeThumbnail ? (
                <span className="absolute inset-0 flex items-center justify-center bg-black/20 text-white">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/55">
                    <Play className="ml-0.5 h-6 w-6 fill-current" />
                  </span>
                </span>
              ) : null}
            </div>
          </button>
          {value ? <p className="mt-3 break-all rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-500">{selectedItem?.name ?? value}</p> : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(true)}>
              <ImagePlus className="h-4 w-4" />
              {value ? mergedLabels.replace : mergedLabels.select}
            </Button>
            {value ? (
              <Button type="button" variant="ghost" onClick={() => updateValue("")}>
                <Trash2 className="h-4 w-4" />
                {mergedLabels.clear}
              </Button>
            ) : null}
          </div>
        </div>
      </AdminField>
      <AdminMediaPicker
        adapter={adapter}
        allowExternal={allowExternal}
        allowedKinds={allowedKinds}
        aspectRatio={mode === "pdf" ? undefined : aspectRatio}
        emptyText={mergedLabels.empty}
        items={availableItems}
        labels={mergedLabels}
        locale={locale}
        onClose={() => setOpen(false)}
        onSelect={(item) => {
          updateValue(item.publicUrl);
          setOpen(false);
        }}
        open={open}
        title={label}
      />
    </>
  );
}

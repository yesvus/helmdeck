// SPDX-License-Identifier: MIT
"use client";

import { useMemo, useState } from "react";
import { ImagePlus, Pencil, Play, Trash2 } from "lucide-react";
import type { AdminMediaAdapter, AdminMediaItem, AdminMediaKind } from "../adapters/index.js";
import { Button } from "../primitives/button.js";
import { AdminField } from "../primitives/field.js";
import { AdminInput } from "../primitives/input.js";
import { useAdminFormValueSignal } from "../primitives/managed-form.js";
import { AdminMediaPlaceholder } from "./placeholder.js";
import {
  AdminMediaPicker,
  getMediaAspectRatioClassName,
  type AdminMediaAspectRatio,
} from "./picker.js";
import { defaultAdminMediaLabels, type AdminMediaLabels } from "./labels.js";
import { useAdminMessages } from "../i18n.js";
import {
  getAdminMediaThumbnailUrl,
  isImageMediaItem,
  isVisualMediaItem,
  isYouTubeMediaItem,
} from "./utils.js";
import { cn } from "../cn.js";

type GalleryEntry = {
  url: string;
  alt: string;
};

function parseGalleryValue(value?: string) {
  return String(value ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separatorIndex = line.indexOf("|");
      const url = (separatorIndex === -1 ? line : line.slice(0, separatorIndex)).trim();
      const alt = separatorIndex === -1 ? "" : line.slice(separatorIndex + 1).trim();
      return { url, alt };
    });
}

function stringifyGalleryValue(entries: GalleryEntry[]) {
  return entries.map((item) => `${item.url}${item.alt ? ` | ${item.alt}` : ""}`).join("\n");
}

export function AdminMediaGalleryField({
  adapter,
  allowExternal = false,
  aspectRatio = "21:9",
  defaultValue,
  hint,
  items,
  label,
  labels,
  locale,
  mode = "visual",
  name,
}: {
  adapter?: AdminMediaAdapter;
  allowExternal?: boolean;
  aspectRatio?: AdminMediaAspectRatio;
  defaultValue?: string;
  hint?: string;
  items: AdminMediaItem[];
  label: string;
  labels?: Partial<AdminMediaLabels>;
  locale?: string;
  mode?: "image" | "visual";
  name: string;
}) {
  const [open, setOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [entries, setEntries] = useState<GalleryEntry[]>(() => parseGalleryValue(defaultValue));
  const hiddenValueRef = useAdminFormValueSignal<HTMLTextAreaElement>(entries);
  const i18n = useAdminMessages();
  const mergedLabels = { ...defaultAdminMediaLabels, ...i18n.media, ...labels };
  const availableItems = useMemo(
    () => items.filter(mode === "image" ? isImageMediaItem : isVisualMediaItem),
    [items, mode],
  );
  const allowedKinds = useMemo<AdminMediaKind[]>(() => {
    if (mode === "image") return ["image"];
    return ["image", "video", "youtube"];
  }, [mode]);

  function openPicker(index: number | null) {
    setEditingIndex(index);
    setOpen(true);
  }

  return (
    <>
      <AdminField label={label} hint={hint}>
        <textarea
          ref={hiddenValueRef}
          readOnly
          name={name}
          value={stringifyGalleryValue(entries)}
          className="sr-only"
          aria-hidden="true"
          tabIndex={-1}
        />
        <p className="mb-3 inline-flex rounded-full bg-zinc-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-600">
          {mergedLabels.recommendedRatio}: {aspectRatio}
        </p>
        <div className="space-y-4 rounded-lg border border-zinc-200 bg-white p-4">
          {entries.length ? (
            <div className="space-y-4">
              {entries.map((entry, index) => {
                const item = items.find((candidate) => candidate.publicUrl === entry.url);
                const thumbnail = item ? getAdminMediaThumbnailUrl(item) : "";
                const youtube = Boolean(item && isYouTubeMediaItem(item));
                return (
                  <div
                    key={`${entry.url}-${index}`}
                    className="grid gap-4 rounded-lg border border-zinc-200 p-4 lg:grid-cols-[160px_minmax(0,1fr)]"
                  >
                    <button
                      type="button"
                      onClick={() => openPicker(index)}
                      className="overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 transition hover:border-zinc-400"
                    >
                      {thumbnail ? (
                        <div
                          role="img"
                          aria-label={entry.alt || label}
                          className={cn("relative w-full bg-cover bg-center", getMediaAspectRatioClassName(aspectRatio))}
                          style={{ backgroundImage: `url("${thumbnail.replaceAll('"', "%22")}")` }}
                        />
                      ) : (
                        <AdminMediaPlaceholder />
                      )}
                      {youtube ? (
                        <span className="absolute inset-0 flex items-center justify-center text-white">
                          <Play className="h-5 w-5 fill-current" />
                        </span>
                      ) : null}
                    </button>
                    <div className="space-y-3">
                      <AdminInput
                        aria-label={`${label} ${index + 1}`}
                        onChange={(event) =>
                          setEntries((current) =>
                            current.map((candidate, candidateIndex) =>
                              candidateIndex === index
                                ? { ...candidate, alt: event.target.value }
                                : candidate,
                            ),
                          )
                        }
                        placeholder={i18n.common.mediaDescription}
                        value={entry.alt}
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" onClick={() => openPicker(index)}>
                          <Pencil className="h-4 w-4" />
                          {mergedLabels.replace}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() =>
                            setEntries((current) => current.filter((_, itemIndex) => itemIndex !== index))
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                          {mergedLabels.clear}
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-500">
              {mergedLabels.empty}
            </div>
          )}
          <Button type="button" variant="outline" onClick={() => openPicker(null)}>
            <ImagePlus className="h-4 w-4" />
            {mergedLabels.select}
          </Button>
        </div>
      </AdminField>
      <AdminMediaPicker
        adapter={adapter}
        allowExternal={allowExternal}
        allowedKinds={allowedKinds}
        aspectRatio={aspectRatio}
        items={availableItems}
        labels={mergedLabels}
        locale={locale}
        onClose={() => {
          setOpen(false);
          setEditingIndex(null);
        }}
        onSelect={(item) => {
          setEntries((current) => {
            if (editingIndex === null) {
              return current.some((entry) => entry.url === item.publicUrl)
                ? current
                : [...current, { url: item.publicUrl, alt: "" }];
            }
            return current.map((entry, index) =>
              index === editingIndex ? { ...entry, url: item.publicUrl } : entry,
            );
          });
          setEditingIndex(null);
          setOpen(false);
        }}
        open={open}
        title={label}
      />
    </>
  );
}

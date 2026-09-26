// SPDX-License-Identifier: MIT
"use client";

import { useId, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { FileUp, Loader2, UploadCloud } from "lucide-react";
import type { AdminMediaAdapter, AdminMediaItem } from "../adapters/index.js";
import { Button } from "../primitives/button.js";
import { AdminInput } from "../primitives/input.js";
import { cn } from "../cn.js";
import { defaultAdminMediaLabels, type AdminMediaLabels } from "./labels.js";
import { useAdminMessages } from "../i18n.js";

export type AdminMediaUploadLabels = Pick<
  AdminMediaLabels,
  "drop" | "browse" | "startUpload" | "uploading" | "uploadSuccess" | "uploadError"
>;

export function AdminMediaUpload({
  accept,
  adapter,
  allowExternal = false,
  className,
  compact = false,
  labels,
  onUploaded,
}: {
  accept?: string;
  adapter: AdminMediaAdapter;
  allowExternal?: boolean;
  className?: string;
  compact?: boolean;
  labels?: Partial<AdminMediaLabels>;
  onUploaded?: (item: AdminMediaItem) => void;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const pendingRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const [error, setError] = useState("");
  const [uploaded, setUploaded] = useState(false);
  const [mode, setMode] = useState<"file" | "external">("file");
  const [externalUrl, setExternalUrl] = useState("");
  const [externalName, setExternalName] = useState("");
  const [savingExternal, setSavingExternal] = useState(false);
  const [pending, setPending] = useState(false);
  const i18n = useAdminMessages();
  const mergedLabels = { ...defaultAdminMediaLabels, ...i18n.media, ...labels };
  const canExternal = allowExternal && Boolean(adapter.addExternal);
  const busy = pending;

  function selectFile(nextFile: File | null) {
    setFile(nextFile);
    setProgress(0);
    setAnnouncement("");
    setError("");
    setUploaded(false);
  }

  function handleDropState(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (busy) return;

    if (event.type === "dragenter") {
      dragDepthRef.current += 1;
      setDragging(true);
    } else if (event.type === "dragover") {
      setDragging(true);
    } else {
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) setDragging(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = 0;
    setDragging(false);
    if (!busy) selectFile(event.dataTransfer.files?.[0] ?? null);
  }

  function handleDropzoneKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      inputRef.current?.click();
    }
  }

  async function upload() {
    if (!file || pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setError("");
    setProgress(1);
    setAnnouncement(mergedLabels.uploading);
    setUploaded(false);

    try {
      const item = await adapter.upload(file, {
        onProgress: (value) => {
          if (pendingRef.current && Number.isFinite(value)) {
            setProgress(Math.round(Math.max(1, Math.min(99, value))));
          }
        },
      });
      setProgress(100);
      setUploaded(true);
      setAnnouncement(mergedLabels.uploadSuccess);
      onUploaded?.(item);
    } catch {
      setProgress(0);
      setAnnouncement("");
      setError(mergedLabels.uploadError);
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  async function addExternal() {
    if (!adapter.addExternal || !externalUrl.trim() || pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setSavingExternal(true);
    setError("");
    try {
      const item = await adapter.addExternal({
        url: externalUrl.trim(),
        name: externalName.trim() || externalUrl.trim(),
      });
      setExternalUrl("");
      setExternalName("");
      onUploaded?.(item);
    } catch {
      setError(mergedLabels.uploadError);
    } finally {
      pendingRef.current = false;
      setPending(false);
      setSavingExternal(false);
    }
  }

  return (
    <div className={cn("space-y-3", className)}>
      {canExternal ? (
        <div className="inline-flex rounded-lg bg-zinc-100 p-1">
          <Button
            type="button"
            size="sm"
            variant={mode === "file" ? "white" : "ghost"}
            onClick={() => setMode("file")}
          >
            {mergedLabels.file}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === "external" ? "white" : "ghost"}
            onClick={() => setMode("external")}
          >
            {mergedLabels.external}
          </Button>
        </div>
      ) : null}
      {mode === "external" && adapter.addExternal ? (
        <form
          className="space-y-3 rounded-xl border border-zinc-200 bg-admin-surface p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void addExternal();
          }}
        >
          <AdminInput
            aria-label={mergedLabels.externalUrl}
            onChange={(event) => setExternalUrl(event.target.value)}
            placeholder={mergedLabels.externalUrl}
            required
            type="url"
            value={externalUrl}
          />
          <AdminInput
            aria-label={mergedLabels.externalName}
            onChange={(event) => setExternalName(event.target.value)}
            placeholder={mergedLabels.externalName}
            value={externalName}
          />
          <div className="flex justify-end">
            <Button type="submit" disabled={savingExternal || !externalUrl.trim()}>
              {savingExternal ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {mergedLabels.addExternal}
            </Button>
          </div>
          {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
        </form>
      ) : (
        <>
          <button
            type="button"
            aria-disabled={busy}
            aria-label={file ? `${mergedLabels.drop}: ${file.name}` : mergedLabels.drop}
            aria-invalid={Boolean(error)}
            onKeyDown={handleDropzoneKeyDown}
            onDragEnter={handleDropState}
            onDragOver={handleDropState}
            onDragLeave={handleDropState}
            onDrop={handleDrop}
            onClick={() => {
              if (!busy) inputRef.current?.click();
            }}
            className={cn(
              "block w-full cursor-pointer rounded-xl border-2 border-dashed p-5 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2",
              compact ? "min-h-32" : "min-h-48",
              error ? "border-red-400 bg-red-50" : dragging ? "border-brand-600 bg-brand-50" : "border-zinc-300 bg-zinc-50 hover:border-brand-500 hover:bg-admin-surface",
              busy && "cursor-wait opacity-70",
            )}
          >
            <UploadCloud className={cn("mx-auto h-8 w-8", dragging ? "text-brand-600" : "text-zinc-500")} />
            <span className="mt-2 block text-sm font-semibold text-zinc-800">{file ? file.name : mergedLabels.drop}</span>
            <span className="mt-1 block text-xs text-zinc-500">{mergedLabels.browse}</span>
          </button>
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept={accept}
            className="sr-only"
            disabled={busy}
            onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
          />
          <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</p>
          {progress > 0 ? (
            <div>
              <div className="mb-1 flex items-center justify-between text-xs text-zinc-500">
                <span aria-hidden="true">{uploaded ? mergedLabels.uploadSuccess : mergedLabels.uploading}</span>
                <span aria-hidden="true">{progress}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-zinc-200" role="progressbar" aria-label={mergedLabels.uploading} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-valuetext={`${progress}%`}>
                <div
                  className="h-full rounded-full bg-brand-500 transition-[width]"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          ) : null}
          {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
          {file ? (
            <div className="flex justify-end">
              <Button type="button" onClick={upload} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                {busy ? mergedLabels.uploading : mergedLabels.startUpload}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

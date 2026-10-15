// SPDX-License-Identifier: MIT
"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { KeyboardEvent } from "react";
import {
  AdminModal,
  AdminModalClose,
  AdminModalContent,
  AdminModalTitle,
} from "../primitives/modal.js";
import { useAdminMessages } from "../i18n.js";
import type { AdminMediaLabels } from "./labels.js";

export type AdminMediaLightboxImage = {
  src: string;
  alt: string;
};

export function AdminMediaLightbox({
  images,
  index,
  open,
  title,
  labels,
  onClose,
  onIndexChange,
}: {
  images: readonly AdminMediaLightboxImage[];
  index: number;
  open: boolean;
  title: string;
  labels?: Pick<AdminMediaLabels, "previousMedia" | "nextMedia">;
  onClose: () => void;
  onIndexChange: (index: number) => void;
}) {
  const messages = useAdminMessages();
  if (!images.length) return null;

  const previousLabel = labels?.previousMedia ?? messages.media.previousMedia;
  const nextLabel = labels?.nextMedia ?? messages.media.nextMedia;
  const activeIndex = Number.isFinite(index)
    ? Math.min(Math.max(Math.trunc(index), 0), images.length - 1)
    : 0;
  const image = images[activeIndex];

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (images.length < 2) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      onIndexChange((activeIndex + images.length - 1) % images.length);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      onIndexChange((activeIndex + 1) % images.length);
    }
  }

  return (
    <AdminModal open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <AdminModalContent
        showCloseButton={false}
        className="fixed inset-0 h-dvh max-h-none w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-admin-media-backdrop p-0 text-admin-inverted-text shadow-none"
        onKeyDown={handleKeyDown}
      >
        <AdminModalTitle className="sr-only">{title}</AdminModalTitle>
        <div className="relative flex min-h-0 flex-1 items-center justify-center px-14 py-16 sm:px-20">
          <img
            src={image.src}
            alt={image.alt}
            className="max-h-full max-w-full object-contain"
          />
          {images.length > 1 ? (
            <>
              <button
                type="button"
                aria-label={previousLabel}
                onClick={() => onIndexChange((activeIndex + images.length - 1) % images.length)}
                className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-admin-media-backdrop/80 text-white transition hover:bg-admin-media-backdrop focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:left-6"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                type="button"
                aria-label={nextLabel}
                onClick={() => onIndexChange((activeIndex + 1) % images.length)}
                className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-admin-media-backdrop/80 text-white transition hover:bg-admin-media-backdrop focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:right-6"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center justify-center gap-4 px-4 pb-[max(env(safe-area-inset-bottom),1rem)] text-sm text-white/80">
          {images.length > 1 ? <span aria-live="polite">{activeIndex + 1} / {images.length}</span> : null}
          <AdminModalClose asChild>
            <button
              type="button"
              aria-label={messages.common.close}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-white/30 bg-admin-media-backdrop/80 text-white transition hover:bg-admin-media-backdrop focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <X className="h-5 w-5" />
            </button>
          </AdminModalClose>
        </div>
      </AdminModalContent>
    </AdminModal>
  );
}

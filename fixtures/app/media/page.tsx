"use client";

import { useEffect, useState } from "react";
import { ImagePlus, UploadCloud } from "lucide-react";
import {
  AdminMediaField,
  AdminMediaPicker,
  AdminMediaPlaceholder,
  AdminMediaUpload,
  AdminSectionCard,
  Button,
  formatMediaSize,
  getAdminMediaThumbnailUrl,
  isPdfMediaItem,
  type AdminMediaItem,
} from "@yesvus/helmdeck";
import { demoMediaAdapter, getDemoMediaItems } from "../../media";
import { useDemoLocale } from "../../components/demo-i18n-provider";

export default function MediaDemoPage() {
  const { copy } = useDemoLocale();
  const [items, setItems] = useState<AdminMediaItem[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedPath, setSelectedPath] = useState<string>();

  useEffect(() => {
    void getDemoMediaItems().then(setItems);
  }, []);

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-10 lg:px-8">
      <div>
        <p className="text-xs font-bold uppercase tracking-[.2em] text-brand-600">{copy.media.kicker}</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight">{copy.media.title}</h1>
        <p className="mt-3 max-w-2xl leading-7 text-zinc-600">{copy.media.body}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <AdminSectionCard icon={UploadCloud} title={copy.media.upload} description={copy.media.uploadBody}>
          <AdminMediaUpload
            accept="image/*,video/*,application/pdf"
            adapter={demoMediaAdapter}
            onUploaded={(item) => setItems((current) => [item, ...current])}
          />
        </AdminSectionCard>
        <AdminSectionCard icon={ImagePlus} title={copy.media.field} description={copy.media.fieldBody}>
          <AdminMediaField
            adapter={demoMediaAdapter}
            items={items}
            label={copy.media.coverImage}
            mode="image"
            name="coverImage"
          />
          <Button className="mt-4" type="button" variant="outline" onClick={() => setPickerOpen(true)}>
            {copy.media.openPicker}
          </Button>
        </AdminSectionCard>
      </div>

      <AdminSectionCard icon={ImagePlus} title={copy.media.library} description={copy.media.records(items.length)}>
        <p className="mb-4 text-xs text-zinc-500">Sample assets: Unsplash photos, MDN Web Docs CC0 video, W3C PDF test file, and the Big Buck Bunny YouTube demo.</p>
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {items.map((item) => {
            const thumbnail = getAdminMediaThumbnailUrl(item);
            return (
              <button key={item.path} type="button" aria-pressed={selectedPath === item.path} onClick={() => setSelectedPath(item.path)} className={`overflow-hidden rounded-xl border bg-white text-left transition hover:border-brand-400 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 ${selectedPath === item.path ? "border-brand-500 ring-2 ring-brand-200" : "border-zinc-200"}`}>
                <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-zinc-100">
                  {thumbnail && item.kind === "image" ? (
                    <div role="img" aria-label={item.name} className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url("${thumbnail}")` }} />
                  ) : (
                    <AdminMediaPlaceholder kind={isPdfMediaItem(item) ? "pdf" : "image"} label={item.kind === "video" ? `${item.name} · video` : item.name} />
                  )}
                </div>
                <div className="p-3">
                  <p className="truncate text-sm font-semibold">{item.name}</p>
                  <p className="mt-1 text-xs uppercase tracking-wider text-zinc-400">
                    {item.kind}{item.size ? ` · ${formatMediaSize(item.size)}` : ""}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
        {selectedPath && <p role="status" className="mt-4 text-sm text-emerald-700">Media selected: {items.find((item) => item.path === selectedPath)?.name}</p>}
      </AdminSectionCard>

      <AdminMediaPicker
        adapter={demoMediaAdapter}
        allowExternal
        items={items}
        onClose={() => setPickerOpen(false)}
        onSelect={() => setPickerOpen(false)}
        open={pickerOpen}
        title={copy.media.chooseMedia}
      />
    </main>
  );
}

"use client";

import { useRef, useState } from "react";
import {
  AdminCollectionEditor,
  AdminField,
  AdminInput,
  AdminMediaField,
  AdminPageHeader,
  AdminSelect,
  adminCollectionFormData,
  useAdminContentLocale,
  useAdminInterfaceLocale,
} from "@yesvus/helmdeck";
import { saveContentBlocks } from "../host/actions";
import { blockKinds, createExampleBlock, exampleBlockDefinition, getExampleBlockLocale, type ExampleBlockKind, type ExampleContentBlock, type ExampleContentBlockEntry } from "../host/block-definition";
import { mediaItems } from "../host/media";
import { createBlockSaveGuard } from "../host/block-save-guard";
import { ContentBlockRenderer } from "./content-block-renderer";

export function ContentBlockEditor({ initial }: { initial: ExampleContentBlockEntry[] }) {
  const [blocks, setBlocks] = useState(initial);
  const [saveState, setSaveState] = useState("");
  const [saving, setSaving] = useState(false);
  const saveGuardRef = useRef(createBlockSaveGuard());
  const { contentLocale } = useAdminContentLocale();
  const { interfaceLocale } = useAdminInterfaceLocale();
  const locale = contentLocale || interfaceLocale;

  function patch(id: string, changes: Partial<ExampleContentBlock>) {
    setBlocks((current) => current.map((entry) => entry.id === id
      ? { ...entry, ...changes } as ExampleContentBlockEntry
      : entry));
    saveGuardRef.current.markChanged();
    setSaveState("Unsaved changes");
  }

  function changeKind(id: string, kind: ExampleBlockKind) {
    setBlocks((current) => current.map((entry) => {
      if (entry.id !== id) return entry;
      const next = createExampleBlock(kind);
      return {
        ...next,
        id,
        heading: entry.heading,
        headingByLocale: entry.headingByLocale,
        copy: entry.copy,
      };
    }));
    saveGuardRef.current.markChanged();
    setSaveState("Unsaved changes");
  }

  async function save() {
    const pendingSave = saveGuardRef.current.save(() =>
      saveContentBlocks(adminCollectionFormData(exampleBlockDefinition, blocks)));
    if (!pendingSave) return;
    setSaving(true);
    setSaveState("Saving…");
    try {
      const { value: result, unchanged } = await pendingSave;
      setSaveState(result.status === "success"
        ? unchanged ? "Saved" : "Unsaved changes"
        : result.message);
    } catch (cause) {
      setSaveState(cause instanceof Error ? cause.message : "The blocks could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="space-y-8">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <AdminPageHeader title="Content blocks" />
        <p className="mt-2 text-sm text-zinc-600">Define and arrange typed blocks. This host owns the save action and the renderer.</p>
      </div>
      <div className="flex items-center gap-4">
        <a href="/blocks-preview" className="text-sm font-semibold text-indigo-700 underline">Public preview</a>
        <button type="button" onClick={() => void save()} disabled={saving} className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-800 disabled:cursor-wait disabled:opacity-60">{saving ? "Saving…" : "Save blocks"}</button>
      </div>
    </div>
    <p aria-live="polite" className="text-sm text-zinc-500">{saveState || `${blocks.length} blocks loaded`}</p>
    <AdminCollectionEditor
      definition={exampleBlockDefinition}
      entries={blocks}
      onChange={(entries) => {
        setBlocks(entries);
        saveGuardRef.current.markChanged();
        setSaveState("Unsaved changes");
      }}
      title="Blocks"
      addLabel="Add block"
      emptyTitle="No blocks yet"
      emptyBody="Add a block to compose this page."
      renderSummary={(entry) => `${blockKinds[entry.kind]?.label ?? "Block"}: ${entry.heading || "Untitled"}`}
      renderFields={(entry) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <AdminField label="Block type">
            <AdminSelect
              value={entry.kind}
              onChange={(event) => changeKind(entry.id, event.target.value as ExampleBlockKind)}
            >
              {Object.entries(blockKinds).map(([kind, definition]) => <option key={kind} value={kind}>{definition.label}</option>)}
            </AdminSelect>
          </AdminField>
          <AdminField label="Heading">
            <AdminInput value={entry.heading} onChange={(event) => patch(entry.id, { heading: event.target.value })} />
          </AdminField>
          <AdminField label="English heading">
            <AdminInput value={entry.headingByLocale.en} onChange={(event) => patch(entry.id, { headingByLocale: { ...entry.headingByLocale, en: event.target.value } })} />
          </AdminField>
          <AdminField label="Turkish heading">
            <AdminInput value={entry.headingByLocale.tr} onChange={(event) => patch(entry.id, { headingByLocale: { ...entry.headingByLocale, tr: event.target.value } })} />
          </AdminField>
          <AdminField label="Copy" className="sm:col-span-2">
            <AdminInput value={entry.copy} onChange={(event) => patch(entry.id, { copy: event.target.value })} />
          </AdminField>
          {entry.kind === "hero" ? <>
            <div className="sm:col-span-2">
              <AdminMediaField
                items={mediaItems}
                label="Image"
                name={`block-image-${entry.id}`}
                defaultValue={entry.imageUrl}
                onValueChange={(imageUrl) => patch(entry.id, { imageUrl })}
              />
            </div>
            <AdminField label="Image description" className="sm:col-span-2">
              <AdminInput value={entry.imageAlt} onChange={(event) => patch(entry.id, { imageAlt: event.target.value })} />
            </AdminField>
          </> : (
            <AdminField label="Attribution" className="sm:col-span-2">
              <AdminInput value={entry.attribution} onChange={(event) => patch(entry.id, { attribution: event.target.value })} />
            </AdminField>
          )}
        </div>
      )}
    />
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Unsaved public preview</h2>
      <ContentBlockRenderer blocks={blocks.map((entry) => ({
        ...entry,
        heading: entry.headingByLocale[getExampleBlockLocale(locale)] || entry.heading,
      }))} />
    </section>
  </div>;
}

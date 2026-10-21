// SPDX-License-Identifier: MIT
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Search } from "lucide-react";
import { cn } from "../cn.js";
import { AdminCombobox } from "./combobox.js";
import type { AdminComboboxOption } from "./combobox.js";

export type AdminCommandPaletteCommand = {
  id: string;
  label: string;
  description?: string;
  group?: string;
  shortcut?: string;
  onRun: () => void;
};

export type AdminCommandPaletteRecord = {
  id: string;
  label: string;
  description?: string;
  href: string;
};

export type AdminCommandPaletteProps = {
  /** The commands the reader can run. The palette adds nothing the host did not give it. */
  commands: AdminCommandPaletteCommand[];
  /** Loads the records the palette shows beside the commands, the way the record search does. */
  loadRecords?: (term: string, signal: AbortSignal) => Promise<AdminCommandPaletteRecord[]>;
  label?: string;
  placeholder?: string;
  /** The key the palette opens on, with the command or control key. */
  shortcut?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  renderCommand?: (command: AdminCommandPaletteCommand) => ReactNode;
  onRunRecord?: (record: AdminCommandPaletteRecord) => void;
};

const isTypingTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
};

/**
 * A palette of commands, over the combobox.
 *
 * The palette is a combobox over a list the host fills: the commands it gives, and the records it
 * loads. The keyboard, the announcements and the states are the combobox's, so a command palette
 * and a typeahead behave the same way.
 */
export function AdminCommandPalette({
  commands,
  loadRecords,
  label = "Commands",
  placeholder = "Type a command",
  shortcut = "k",
  open,
  onOpenChange,
  className,
  renderCommand,
  onRunRecord,
}: AdminCommandPaletteProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open ?? internalOpen;
  const setOpen = useCallback((next: boolean) => {
    if (open === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  }, [open, onOpenChange]);
  const panelRef = useRef<HTMLDivElement>(null);
  // The commands and the loader are read through a ref, so that the loader the combobox holds
  // does not change with every render. A loader that changed would make the combobox load again
  // on every render, and the answer of one load would be dropped by the next.
  const commandsRef = useRef(commands);
  const loaderRef = useRef(loadRecords);
  useEffect(() => {
    commandsRef.current = commands;
    loaderRef.current = loadRecords;
  }, [commands, loadRecords]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.metaKey && !event.ctrlKey) return;
      if (event.key.toLocaleLowerCase() !== shortcut.toLocaleLowerCase()) return;
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      setOpen(true);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [shortcut, setOpen]);

  const load = useCallback(async (term: string, signal: AbortSignal): Promise<AdminComboboxOption[]> => {
    const lowered = term.trim().toLocaleLowerCase();
    const matching = commandsRef.current.filter((command) => !lowered
      || command.label.toLocaleLowerCase().includes(lowered)
      || command.description?.toLocaleLowerCase().includes(lowered));
    const options: AdminComboboxOption[] = matching.map((command) => ({
      id: `command:${command.id}`,
      label: command.label,
      description: command.description ?? command.group,
      value: { kind: "command", command },
    }));
    const loader = loaderRef.current;
    if (loader) {
      const records = await loader(term, signal);
      for (const record of records) {
        options.push({
          id: `record:${record.id}`,
          label: record.label,
          description: record.description,
          value: { kind: "record", record },
        });
      }
    }
    return options;
  }, []);

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={isOpen}
        aria-keyshortcuts={`Control+${shortcut.toUpperCase()} Meta+${shortcut.toUpperCase()}`}
        onClick={() => setOpen(true)}
        className="flex h-9 items-center gap-2 rounded-lg border border-zinc-300 bg-admin-surface px-3 text-sm text-zinc-500 hover:bg-admin-surface-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
      >
        <Search aria-hidden="true" className="h-4 w-4" />
        <span>{label}</span>
        <kbd className="rounded border border-zinc-300 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-zinc-500">
          {`⌘${shortcut.toUpperCase()}`}
        </kbd>
      </button>
      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-admin-overlay/60 p-4 pt-[10vh] backdrop-blur-sm">
          <div
            ref={panelRef}
            role="dialog"
            aria-label={label}
            className="w-full max-w-lg overflow-hidden rounded-admin-card border border-zinc-200 bg-admin-surface shadow-2xl"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setOpen(false);
              }
            }}
          >
            <AdminCombobox
              label={label}
              placeholder={placeholder}
              load={load}
              closeLabel="Close the palette"
              onOpenChange={(next) => { if (!next) setOpen(false); }}
              onSelect={(option) => {
                const value = option.value as
                  | { kind: "command"; command: AdminCommandPaletteCommand }
                  | { kind: "record"; record: AdminCommandPaletteRecord }
                  | undefined;
                if (!value) return;
                if (value.kind === "command") value.command.onRun();
                else onRunRecord?.(value.record);
                setOpen(false);
              }}
              renderOption={(option) => {
                const value = option.value as
                  | { kind: "command"; command: AdminCommandPaletteCommand }
                  | { kind: "record"; record: AdminCommandPaletteRecord }
                  | undefined;
                if (value?.kind === "command" && renderCommand) return renderCommand(value.command);
                return (
                  <>
                    <span className="block truncate text-sm font-medium text-zinc-900">{option.label}</span>
                    {option.description ? (
                      <span className="block truncate text-xs text-zinc-500">{option.description}</span>
                    ) : null}
                  </>
                );
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

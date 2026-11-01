// SPDX-License-Identifier: MIT
"use client";

import { useTransition } from "react";
import { Button } from "./button.js";
import { useAdminFormDirty } from "./managed-form.js";
import { useAdminMessages } from "../i18n.js";

export function AdminFormActionPanel({
  onSave,
  saveLabel,
  onPublish,
  publishLabel,
  onDiscard,
  discardLabel,
  className,
}: {
  onSave: () => void | Promise<void>;
  saveLabel?: string;
  onPublish?: () => void | Promise<void>;
  publishLabel?: string;
  onDiscard?: () => void;
  discardLabel?: string;
  className?: string;
}) {
  const dirty = useAdminFormDirty() === true;
  const [pending, startTransition] = useTransition();
  const messages = useAdminMessages();
  const labels = messages.formActionPanel;

  return (
    <aside className={`sticky bottom-0 z-10 -mx-4 border-t border-admin-border bg-admin-surface/95 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-lg backdrop-blur sm:mx-0 sm:ml-auto sm:w-80 sm:rounded-admin-card sm:border ${className ?? ""}`}>
      <p aria-live="polite" role="status" className="mb-3 text-sm text-zinc-600">
        {pending ? messages.form.pendingLabel : dirty ? labels.unsaved : messages.settingsPanel.saved}
      </p>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" disabled={!dirty || pending} onClick={() => startTransition(async () => { await onSave(); })}>{saveLabel ?? labels.save}</Button>
        {onPublish ? <Button type="button" variant="secondary" disabled={!dirty || pending} onClick={() => startTransition(async () => { await onPublish(); })}>{publishLabel ?? labels.publish}</Button> : null}
        {onDiscard ? <Button type="button" variant="ghost" disabled={!dirty || pending} onClick={() => {
          if (window.confirm(labels.discardConfirm)) onDiscard();
        }}>{discardLabel ?? labels.discard}</Button> : null}
      </div>
    </aside>
  );
}

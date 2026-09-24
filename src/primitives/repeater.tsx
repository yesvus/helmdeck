// SPDX-License-Identifier: MIT
"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "./button.js";
import { AdminInput } from "./input.js";
import { useAdminFormValueSignal } from "./managed-form.js";
import { useAdminMessages } from "../i18n.js";

export function AdminRepeaterListField({
  addLabel,
  defaultItems = [],
  hint,
  itemLabel,
  label,
  name,
  removeLabel,
}: {
  addLabel: string;
  defaultItems?: string[];
  hint?: string;
  itemLabel: string;
  label?: string;
  name: string;
  removeLabel?: (index: number) => string;
}) {
  const [items, setItems] = useState(defaultItems.length > 0 ? defaultItems : [""]);
  const i18n = useAdminMessages();
  const hiddenValueRef = useAdminFormValueSignal<HTMLTextAreaElement>(items);

  return (
    <div className="space-y-2">
      {label || hint ? (
        <div className="space-y-1">
          {label ? <p className="text-sm font-semibold text-zinc-900">{label}</p> : null}
          {hint ? <p className="text-xs leading-6 text-zinc-500">{hint}</p> : null}
        </div>
      ) : null}
      <textarea
        ref={hiddenValueRef}
        readOnly
        name={name}
        value={items.map((item) => item.trim()).filter(Boolean).join("\n")}
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
      />
      <div className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4">
        {items.map((item, index) => (
          <div key={`${name}-${index}`} className="flex items-center gap-3">
            <AdminInput
              value={item}
              onChange={(event) =>
                setItems((current) =>
                  current.map((currentItem, currentIndex) =>
                    currentIndex === index ? event.target.value : currentItem,
                  ),
                )
              }
              placeholder={`${itemLabel} ${index + 1}`}
              aria-label={`${itemLabel} ${index + 1}`}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() =>
                setItems((current) =>
                  current.length === 1
                    ? [""]
                    : current.filter((_, currentIndex) => currentIndex !== index),
                )
              }
              aria-label={removeLabel?.(index) ?? i18n.common.removeItem(itemLabel, index + 1)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" onClick={() => setItems((current) => [...current, ""])}>
          <Plus className="h-4 w-4" />
          {addLabel}
        </Button>
      </div>
    </div>
  );
}

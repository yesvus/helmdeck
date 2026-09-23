"use client";

import { useState, type DragEvent, type ReactNode } from "react";
import { ChevronDown, ChevronUp, GripVertical } from "lucide-react";
import { cn } from "../cn";

export type AdminSortableLabels = {
  dragHint: string;
  moveUp: string;
  moveDown: string;
};

export const defaultSortableLabels: AdminSortableLabels = {
  dragHint: "Drag to reorder, or use the move buttons",
  moveUp: "Move up",
  moveDown: "Move down",
};

function move<T>(items: T[], from: number, to: number): T[] {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function AdminSortableList<T>({
  items,
  onReorder,
  getKey,
  renderItem,
  labels,
  className,
}: {
  items: T[];
  onReorder: (items: T[]) => void;
  getKey: (item: T) => string | number;
  renderItem: (item: T) => ReactNode;
  labels?: Partial<AdminSortableLabels>;
  className?: string;
}) {
  const merged = { ...defaultSortableLabels, ...labels };
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  function handleDrop(targetIndex: number, event: DragEvent<HTMLElement>) {
    event.preventDefault();
    if (dragIndex !== null && dragIndex !== targetIndex) {
      onReorder(move(items, dragIndex, targetIndex));
    }
    setDragIndex(null);
    setOverIndex(null);
  }

  return (
    <ul className={cn("space-y-2", className)} aria-label={merged.dragHint}>
      {items.map((item, index) => (
        <li
          key={getKey(item)}
          draggable
          onDragStart={() => setDragIndex(index)}
          onDragOver={(event) => {
            event.preventDefault();
            setOverIndex(index);
          }}
          onDragEnd={() => {
            setDragIndex(null);
            setOverIndex(null);
          }}
          onDrop={(event) => handleDrop(index, event)}
          className={cn(
            "flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 transition-colors",
            overIndex === index && dragIndex !== null && dragIndex !== index
              ? "border-brand-500 bg-brand-100"
              : "hover:bg-zinc-50",
            dragIndex === index && "opacity-50",
          )}
        >
          <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-zinc-400" aria-hidden="true" />
          <div className="min-w-0 flex-1">{renderItem(item)}</div>
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              aria-label={`${merged.moveUp}: ${index + 1}`}
              title={merged.moveUp}
              disabled={index === 0}
              onClick={() => onReorder(move(items, index, index - 1))}
              className="flex h-7 w-7 items-center justify-center rounded border border-zinc-200 bg-white text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label={`${merged.moveDown}: ${index + 1}`}
              title={merged.moveDown}
              disabled={index === items.length - 1}
              onClick={() => onReorder(move(items, index, index + 1))}
              className="flex h-7 w-7 items-center justify-center rounded border border-zinc-200 bg-white text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

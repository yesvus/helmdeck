// SPDX-License-Identifier: MIT
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AlertCircle, CheckCircle2, GripVertical } from "lucide-react";
import { cn } from "../cn";
import { AdminToastCard, AdminToastViewport } from "./toast";

function subscribeToMediaQuery(mediaQuery: string) {
  return (onStoreChange: () => void) => {
    const query = window.matchMedia(mediaQuery);
    query.addEventListener("change", onStoreChange);
    return () => query.removeEventListener("change", onStoreChange);
  };
}

function useMediaQueryMatch(mediaQuery: string, serverSnapshot: boolean) {
  return useSyncExternalStore(
    useMemo(() => subscribeToMediaQuery(mediaQuery), [mediaQuery]),
    () => window.matchMedia(mediaQuery).matches,
    () => serverSnapshot,
  );
}

function usePrefersReducedMotion() {
  return useMediaQueryMatch("(prefers-reduced-motion: reduce)", false);
}

export type AdminSortableResult = {
  success: boolean;
  message: string;
};

export const defaultSortableMessages = {
  reorderFailed: "Could not save the new order. Please try again.",
  toastSuccessTitle: "Order updated",
  toastErrorTitle: "Could not update the order",
  announcements: {
    dragStart: (id: string) => `Picked up ${id}.`,
    dragOver: (id: string, overId: string) => `${id} is over ${overId}.`,
    dragEnd: (id: string) => `${id} was moved to a new position.`,
    dragCancel: (id: string) => `${id} was not moved.`,
  },
};

export function useAdminSortableList<T>({
  items,
  getId,
  disabled,
  onReorder,
}: {
  items: T[];
  getId: (item: T) => string;
  disabled?: boolean;
  onReorder: (orderedIds: string[]) => Promise<AdminSortableResult>;
}) {
  const [orderedItems, setOrderedItems] = useState(items);
  const [previousItems, setPreviousItems] = useState(items);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  if (items !== previousItems) {
    setPreviousItems(items);
    setOrderedItems(items);
  }

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  const showToast = useCallback((tone: "success" | "error", message: string) => {
    setToast({ tone, message });

    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }

    toastTimeoutRef.current = setTimeout(() => setToast(null), 4000);
  }, []);

  const ids = useMemo(() => orderedItems.map(getId), [orderedItems, getId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;

      if (disabled || !over || active.id === over.id) {
        return;
      }

      const oldIndex = ids.indexOf(String(active.id));
      const newIndex = ids.indexOf(String(over.id));

      if (oldIndex === -1 || newIndex === -1) {
        return;
      }

      const previousOrder = orderedItems;
      const nextItems = arrayMove(orderedItems, oldIndex, newIndex);
      setOrderedItems(nextItems);
      setIsSaving(true);

      try {
        const result = await onReorder(nextItems.map(getId));

        if (!result.success) {
          setOrderedItems(previousOrder);
          showToast("error", result.message);
        } else {
          showToast("success", result.message);
        }
      } catch {
        setOrderedItems(previousOrder);
        showToast("error", defaultSortableMessages.reorderFailed);
      } finally {
        setIsSaving(false);
      }
    },
    [disabled, ids, orderedItems, getId, onReorder, showToast],
  );

  const announcements: Announcements = useMemo(
    () => ({
      onDragStart: ({ active }) => defaultSortableMessages.announcements.dragStart(String(active.id)),
      onDragOver: ({ active, over }) =>
        over
          ? defaultSortableMessages.announcements.dragOver(String(active.id), String(over.id))
          : "",
      onDragEnd: ({ active, over }) =>
        over
          ? defaultSortableMessages.announcements.dragEnd(String(active.id))
          : defaultSortableMessages.announcements.dragCancel(String(active.id)),
      onDragCancel: ({ active }) => defaultSortableMessages.announcements.dragCancel(String(active.id)),
    }),
    [],
  );

  return {
    orderedItems,
    ids,
    isSaving,
    sensors,
    handleDragEnd,
    announcements,
    prefersReducedMotion,
    toast,
    dismissToast: () => setToast(null),
  };
}

export function AdminSortableDndContext({
  ids,
  sensors,
  announcements,
  onDragEnd,
  children,
}: {
  ids: string[];
  sensors: ReturnType<typeof useSensors>;
  announcements: Announcements;
  onDragEnd: (event: DragEndEvent) => void;
  children: ReactNode;
}) {
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      accessibility={{ announcements }}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

export function AdminSortableToast({
  toast,
  onDismiss,
}: {
  toast: { tone: "success" | "error"; message: string } | null;
  onDismiss: () => void;
}) {
  if (!toast) {
    return null;
  }

  return (
    <AdminToastViewport>
      <AdminToastCard
        tone={toast.tone}
        title={
          toast.tone === "success"
            ? defaultSortableMessages.toastSuccessTitle
            : defaultSortableMessages.toastErrorTitle
        }
        body={toast.message}
        icon={
          toast.tone === "success" ? (
            <CheckCircle2 className="h-5 w-5" />
          ) : (
            <AlertCircle className="h-5 w-5" />
          )
        }
        onClose={onDismiss}
      />
    </AdminToastViewport>
  );
}

type SortableHandleContextValue = {
  attributes: ReturnType<typeof useSortable>["attributes"];
  listeners: ReturnType<typeof useSortable>["listeners"];
  setActivatorNodeRef: ReturnType<typeof useSortable>["setActivatorNodeRef"];
  disabled?: boolean;
};

const SortableHandleContext = createContext<SortableHandleContextValue | null>(null);

function useSortableRowState(id: string, disabled?: boolean) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled });
  const prefersReducedMotion = usePrefersReducedMotion();
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: prefersReducedMotion ? undefined : transition,
    opacity: isDragging ? 0.6 : 1,
    position: "relative",
    zIndex: isDragging ? 10 : undefined,
  };
  const contextValue: SortableHandleContextValue = {
    attributes,
    listeners,
    setActivatorNodeRef,
    disabled,
  };

  return { setNodeRef, style, contextValue };
}

export function AdminSortableRow({
  id,
  disabled,
  children,
  className,
}: {
  id: string;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const { setNodeRef, style, contextValue } = useSortableRowState(id, disabled);

  return (
    <tr ref={setNodeRef} style={style} className={className}>
      <SortableHandleContext.Provider value={contextValue}>
        {children}
      </SortableHandleContext.Provider>
    </tr>
  );
}

export function AdminSortableCard({
  id,
  disabled,
  children,
  className,
}: {
  id: string;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const { setNodeRef, style, contextValue } = useSortableRowState(id, disabled);

  return (
    <div ref={setNodeRef} style={style} className={className}>
      <SortableHandleContext.Provider value={contextValue}>
        {children}
      </SortableHandleContext.Provider>
    </div>
  );
}

export function AdminDragHandle({ label }: { label: string }) {
  const context = useContext(SortableHandleContext);

  if (!context) {
    throw new Error("AdminDragHandle must be rendered inside AdminSortableRow or AdminSortableCard.");
  }

  const { attributes, listeners, setActivatorNodeRef, disabled } = context;

  return (
    <button
      ref={setActivatorNodeRef}
      type="button"
      disabled={disabled}
      aria-label={label}
      className={cn(
        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-400 transition-colors",
        disabled
          ? "cursor-not-allowed opacity-40"
          : "cursor-grab touch-none hover:border-zinc-400 hover:text-zinc-700 active:cursor-grabbing",
      )}
      {...attributes}
      {...listeners}
    >
      <GripVertical className="h-4 w-4" />
    </button>
  );
}

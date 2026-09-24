// SPDX-License-Identifier: MIT
"use client";

import { createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "../cn.js";

type Side = "top" | "right" | "bottom" | "left";
type Align = "start" | "center" | "end";
type TooltipOptions = { side?: Side; align?: Align; sideOffset?: number; alignOffset?: number };
const TooltipContext = createContext<{ delay: number }>({ delay: 0 });

export function TooltipProvider({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  return <TooltipContext.Provider value={{ delay }}>{children}</TooltipContext.Provider>;
}

export function Tooltip({ children, content, label, className, ...options }: TooltipOptions & { children: ReactNode; content: ReactNode; label: string; className?: string }) {
  const provider = useContext(TooltipContext);
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointer = useRef(false);
  const clickOpen = useRef(false);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({});
  const show = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), provider.delay);
  };
  const close = (immediate = false) => {
    if (timer.current) clearTimeout(timer.current);
    if (immediate) { clickOpen.current = false; setOpen(false); }
    else timer.current = setTimeout(() => { clickOpen.current = false; setOpen(false); }, 100);
  };

  useEffect(() => {
    const resetPointer = () => { pointer.current = false; };
    document.addEventListener("pointerup", resetPointer);
    return () => document.removeEventListener("pointerup", resetPointer);
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    const dismiss = (event: Event) => {
      if (event.type === "keydown" && (event as KeyboardEvent).key === "Escape") close(true);
      if (event.type === "pointerdown" && !triggerRef.current?.contains(event.target as Node) && !contentRef.current?.contains(event.target as Node)) close(true);
    };
    document.addEventListener("keydown", dismiss);
    document.addEventListener("pointerdown", dismiss);
    return () => {
      document.removeEventListener("keydown", dismiss);
      document.removeEventListener("pointerdown", dismiss);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !contentRef.current) return;
    const anchor = triggerRef.current.getBoundingClientRect();
    const popup = contentRef.current.getBoundingClientRect();
    const side = options.side ?? "bottom";
    const align = options.align ?? "center";
    const gap = options.sideOffset ?? 8;
    const shift = options.alignOffset ?? 0;
    const horizontal = side === "top" || side === "bottom";
    let left = horizontal ? anchor.left + (align === "start" ? 0 : align === "end" ? anchor.width - popup.width : (anchor.width - popup.width) / 2) + shift : side === "right" ? anchor.right + gap : anchor.left - popup.width - gap;
    let top = horizontal ? side === "bottom" ? anchor.bottom + gap : anchor.top - popup.height - gap : anchor.top + (align === "start" ? 0 : align === "end" ? anchor.height - popup.height : (anchor.height - popup.height) / 2) + shift;
    left = Math.max(8, Math.min(left, window.innerWidth - popup.width - 8));
    top = Math.max(8, Math.min(top, window.innerHeight - popup.height - 8));
    setPosition({ position: "fixed", left, top });
  }, [open, options.align, options.alignOffset, options.side, options.sideOffset]);

  return <span className={cn("relative inline-flex shrink-0 align-middle", className)} onPointerEnter={() => { if (!pointer.current) show(); }} onPointerLeave={() => close()}>
    <button ref={triggerRef} type="button" aria-label={label} aria-describedby={id} aria-expanded={open} onPointerDown={(event) => { pointer.current = true; if (timer.current) clearTimeout(timer.current); event.stopPropagation(); }} onClick={(event) => { event.preventDefault(); event.stopPropagation(); if (timer.current) clearTimeout(timer.current); clickOpen.current = !clickOpen.current; setOpen(clickOpen.current); }} onFocus={() => { if (!pointer.current) show(); }} onBlur={() => close()} className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">{children}</button>
    {typeof document !== "undefined" && createPortal(<div ref={contentRef} id={id} role="tooltip" hidden={!open} style={position} onPointerEnter={() => { if (timer.current) clearTimeout(timer.current); }} onPointerLeave={() => close()} className={cn("z-[100] w-max max-w-64 rounded-md bg-zinc-950 px-3 py-2 text-xs font-normal leading-5 text-white shadow-lg motion-reduce:transition-none", open && "animate-in fade-in-0 duration-100")}><span className="absolute -top-1 left-1/2 size-2 rotate-45 bg-zinc-950" aria-hidden="true" />{content}</div>, document.body)}
  </span>;
}

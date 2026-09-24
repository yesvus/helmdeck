// SPDX-License-Identifier: MIT
"use client";

import { cloneElement, createContext, useContext, useEffect, useId, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "../cn.js";

type Side = "top" | "right" | "bottom" | "left";
type Align = "start" | "center" | "end";
type TooltipOptions = { side?: Side; align?: Align; sideOffset?: number; alignOffset?: number };
const TooltipContext = createContext<{ delay: number }>({ delay: 0 });

export function TooltipProvider({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  return <TooltipContext.Provider value={{ delay }}>{children}</TooltipContext.Provider>;
}

export function Tooltip({ children, content, label, className, ...options }: TooltipOptions & { children: ReactElement; content: ReactNode; label?: string; className?: string }) {
  const provider = useContext(TooltipContext);
  const id = useId();
  const triggerRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointer = useRef(false);
  const clickOpen = useRef(false);
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ popup: CSSProperties; arrow: CSSProperties }>({ popup: {}, arrow: {} });
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
    setMounted(true);
    const resetPointer = () => { pointer.current = false; };
    document.addEventListener("pointerup", resetPointer);
    return () => {
      document.removeEventListener("pointerup", resetPointer);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  useEffect(() => {
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

  useEffect(() => {
    if (!mounted || !open || !triggerRef.current || !contentRef.current) return;
    const side = options.side ?? "bottom";
    const align = options.align ?? "center";
    const gap = options.sideOffset ?? 8;
    const shift = options.alignOffset ?? 0;
    const horizontal = side === "top" || side === "bottom";
    const updatePosition = () => {
      if (!triggerRef.current || !contentRef.current) return;
      const anchor = triggerRef.current.getBoundingClientRect();
      const popup = contentRef.current.getBoundingClientRect();
      let left = horizontal ? anchor.left + (align === "start" ? 0 : align === "end" ? anchor.width - popup.width : (anchor.width - popup.width) / 2) + shift : side === "right" ? anchor.right + gap : anchor.left - popup.width - gap;
      let top = horizontal ? side === "bottom" ? anchor.bottom + gap : anchor.top - popup.height - gap : anchor.top + (align === "start" ? 0 : align === "end" ? anchor.height - popup.height : (anchor.height - popup.height) / 2) + shift;
      left = Math.max(8, Math.min(left, window.innerWidth - popup.width - 8));
      top = Math.max(8, Math.min(top, window.innerHeight - popup.height - 8));
      const anchorCenterX = anchor.left + anchor.width / 2 - left;
      const anchorCenterY = anchor.top + anchor.height / 2 - top;
      const arrow: CSSProperties = horizontal
        ? { left: Math.max(8, Math.min(anchorCenterX - 4, popup.width - 16)), [side === "top" ? "bottom" : "top"]: -4 }
        : { top: Math.max(8, Math.min(anchorCenterY - 4, popup.height - 16)), [side === "left" ? "right" : "left"]: -4 };
      setPosition({ popup: { position: "fixed", left, top }, arrow });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [mounted, open, options.align, options.alignOffset, options.side, options.sideOffset]);

  const childProps = children.props as Record<string, unknown>;
  const trigger = cloneElement(children, {
    ref: triggerRef,
    "aria-label": label ?? childProps["aria-label"],
    "aria-describedby": [childProps["aria-describedby"], id].filter(Boolean).join(" "),
    "aria-expanded": open,
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
      (childProps.onPointerDown as ((event: React.PointerEvent<HTMLElement>) => void) | undefined)?.(event);
      event.stopPropagation();
      if (event.defaultPrevented) return;
      pointer.current = true;
      if (timer.current) clearTimeout(timer.current);
    },
    onClick: (event: React.MouseEvent<HTMLElement>) => {
      (childProps.onClick as ((event: React.MouseEvent<HTMLElement>) => void) | undefined)?.(event);
      event.stopPropagation();
      if (event.defaultPrevented) return;
      if (triggerRef.current?.closest("label")) event.preventDefault();
      if (timer.current) clearTimeout(timer.current);
      clickOpen.current = !clickOpen.current;
      setOpen(clickOpen.current);
    },
    onFocus: (event: React.FocusEvent<HTMLElement>) => {
      (childProps.onFocus as ((event: React.FocusEvent<HTMLElement>) => void) | undefined)?.(event);
      if (!event.defaultPrevented && !pointer.current) show();
    },
    onBlur: (event: React.FocusEvent<HTMLElement>) => {
      (childProps.onBlur as ((event: React.FocusEvent<HTMLElement>) => void) | undefined)?.(event);
      if (!event.defaultPrevented) close();
    },
  } as never);

  return <span className={cn("relative inline-flex shrink-0 align-middle", className)} onPointerEnter={() => { if (!pointer.current) show(); }} onPointerLeave={() => close()}>
    {trigger}
    {mounted && createPortal(<div ref={contentRef} id={id} role="tooltip" data-side={options.side ?? "bottom"} data-align={options.align ?? "center"} hidden={!open} style={position.popup} onPointerEnter={() => { if (timer.current) clearTimeout(timer.current); }} onPointerLeave={() => close()} className={cn("z-[100] w-max max-w-64 rounded-md bg-zinc-950 px-3 py-2 text-xs font-normal leading-5 text-white shadow-lg motion-reduce:transition-none", open && "animate-in fade-in-0 duration-100")}><span className="absolute size-2 rotate-45 bg-zinc-950" style={position.arrow} aria-hidden="true" />{content}</div>, document.body)}
  </span>;
}

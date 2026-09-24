// SPDX-License-Identifier: MIT
"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Info } from "lucide-react";
import { cn } from "../cn.js";

export function AdminContextualHelp({
  label,
  children,
  className,
}: {
  label: string;
  children: string;
  className?: string;
}) {
  const id = useId();
  const rootRef = useRef<HTMLSpanElement>(null);
  const pointerActivation = useRef(false);
  const clickOpen = useRef(false);
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const visible = open && !dismissed;

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        clickOpen.current = false;
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && visible) {
        clickOpen.current = false;
        setOpen(false);
        setDismissed(true);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [visible]);

  return (
    <span
      ref={rootRef}
      className={cn("relative inline-flex align-middle", className)}
      onMouseEnter={() => { setDismissed(false); setOpen(true); }}
      onMouseLeave={() => {
        clickOpen.current = false;
        setOpen(false);
      }}
    >
      <button
        type="button"
        aria-label={label}
        aria-describedby={id}
        aria-expanded={visible}
        onPointerDown={() => { pointerActivation.current = true; }}
        onFocus={() => {
          if (!pointerActivation.current) {
            setDismissed(false);
            setOpen(true);
          }
        }}
        onBlur={() => {
          clickOpen.current = false;
          setOpen(false);
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          pointerActivation.current = false;
          clickOpen.current = !clickOpen.current;
          setDismissed(false);
          setOpen(clickOpen.current);
        }}
        className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
      >
        <Info className="h-4 w-4" aria-hidden="true" />
      </button>
      <span
        id={id}
        role="tooltip"
        hidden={!visible}
        className="absolute left-1/2 top-full z-50 mt-2 w-max max-w-64 -translate-x-1/2 rounded-md bg-zinc-950 px-3 py-2 text-xs font-normal leading-5 text-white shadow-lg before:absolute before:bottom-full before:left-0 before:h-2 before:w-full before:content-['']"
      >
        {children}
      </span>
    </span>
  );
}

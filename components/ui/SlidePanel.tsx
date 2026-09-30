"use client";

import { type ReactNode, useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { useFocusTrap } from "@/lib/hooks/useFocusTrap";
import { useScrollLock } from "@/lib/hooks/useScrollLock";

interface SlidePanelProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  sub?: string;
  width?: string;
  footer?: ReactNode;
  children: ReactNode;
}

export function SlidePanel({
  open,
  onClose,
  title,
  sub,
  width = "420px",
  footer,
  children,
}: SlidePanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Lock body scroll while open (nest-safe: ref-counted, see useScrollLock).
  useScrollLock(open);

  // Trap focus inside the panel, move initial focus in on open, restore on close.
  useFocusTrap(panelRef, open);

  return (
    <>
      {/* Overlay */}
      <div
        className={cn(
          "fixed inset-0 z-[400] bg-black/40 backdrop-blur-[2px]",
          "transition-opacity duration-200",
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel — stays mounted while closed so the slide-out transition can
          play. `role="dialog"` stays static (a conditional role trips the
          a11y linter's aria-prop/role check), but `aria-hidden` + `inert`
          while closed pull it out of the accessibility tree and tab order
          entirely, so it doesn't present as an open, focusable dialog while
          visually hidden. `aria-modal` is dropped while closed too. */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal={open ? "true" : undefined}
        aria-hidden={open ? undefined : "true"}
        aria-label={title}
        tabIndex={-1}
        inert={open ? undefined : true}
        className={cn(
          "fixed top-0 right-0 bottom-0 z-[401]",
          "bg-[var(--surface)] border-l border-[var(--line)]",
          "flex flex-col",
          "transition-transform duration-[250ms] ease-out",
          "w-full md:w-auto",
          open ? "translate-x-0" : "translate-x-full"
        )}
        style={{ maxWidth: width }}
      >
        {/* Header */}
        {title && (
          <div className="px-6 py-5 border-b border-[var(--line)] bg-[var(--surface-2)] shrink-0">
            <div className="text-[20px] font-[700] tracking-[-0.025em] leading-none mb-1">
              {title}
            </div>
            {sub && (
              <div className="font-[var(--font-mono)] text-[11px] text-[var(--muted)]">
                {sub}
              </div>
            )}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="px-6 py-3.5 border-t border-[var(--line)] bg-[var(--surface-2)] flex gap-2 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </>
  );
}

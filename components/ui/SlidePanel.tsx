"use client";

import { type ReactNode, useEffect, useRef } from "react";
import { XIcon } from "@/components/ui/icons";
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
          "fixed inset-0 z-[400] bg-[var(--scrim)] backdrop-blur-[3px]",
          "transition-opacity duration-300",
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
          "bg-[var(--paper)] border-l border-[var(--line)] shadow-[var(--shadow-md)]",
          "flex flex-col focus-visible:outline-none",
          "transition-transform duration-[420ms] ease-[var(--ease)]",
          "w-full md:w-auto",
          open ? "translate-x-0" : "translate-x-full"
        )}
        style={{ maxWidth: width }}
      >
        {/* Header */}
        {title && (
          <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-5 border-b border-[var(--line)] shrink-0">
            <div className="min-w-0">
              <div className="type-display text-[22px]">{title}</div>
              {sub && (
                <div className="mt-1.5 text-[13.5px] text-[var(--muted)]">
                  {sub}
                </div>
              )}
            </div>
            {/* reserve room for the close button, which sits last in DOM order */}
            <span aria-hidden="true" className="w-8 shrink-0" />
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>

        {/* Footer */}
        {footer && (
          <div
            className="px-6 pt-4 border-t border-[var(--line)] bg-[var(--paper)] flex gap-2 shrink-0"
            style={{
              paddingBottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
            }}
          >
            {footer}
          </div>
        )}

        {/* Last in DOM order so opening the panel focuses its first field. */}
        {title && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="absolute top-5 right-4 size-9 rounded-[var(--r)] flex items-center justify-center text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--hover)] cursor-pointer transition-colors"
          >
            <XIcon aria-hidden="true" className="size-[18px]" />
          </button>
        )}
      </div>
    </>
  );
}

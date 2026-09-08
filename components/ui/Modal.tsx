"use client";

import { type ReactNode, useEffect, useId, useRef } from "react";
import { cn } from "@/lib/cn";
import { useFocusTrap } from "@/lib/hooks/useFocusTrap";
import { useScrollLock } from "@/lib/hooks/useScrollLock";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** Heading text; also wired as the dialog's accessible name. */
  title: string;
  /** Optional supporting line rendered under the title. */
  sub?: ReactNode;
  /** Max panel width, e.g. "440px". Defaults to "480px". */
  maxWidth?: string;
  children: ReactNode;
}

/**
 * Centered modal dialog: dimmed backdrop, elevated `--paper` panel, close on
 * backdrop-click or Escape, body scroll-lock while open. Shared shell for the
 * create-invoice / send / record-payment / void / decline dialogs.
 */
export function Modal({
  open,
  onClose,
  title,
  sub,
  maxWidth = "480px",
  children,
}: ModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape (document-level so the panel needn't hold focus).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Lock body scroll while open (nest-safe: ref-counted, see useScrollLock).
  useScrollLock(open);

  // Trap focus inside the panel, move initial focus in on open, restore on close.
  useFocusTrap(panelRef, open);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop — click to dismiss. */}
      <div
        className="absolute inset-0 bg-black/45 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative bg-[var(--paper)] rounded-lg p-8 w-[calc(100%-32px)] shadow-2xl"
        style={{ maxWidth }}
      >
        <h2
          id={titleId}
          className={cn(
            "text-[20px] font-[700] tracking-[-0.02em]",
            sub ? "mb-1" : "mb-4"
          )}
        >
          {title}
        </h2>
        {sub ? (
          <p className="text-[13px] text-[var(--ink-2)] mb-4">{sub}</p>
        ) : null}
        {children}
      </div>
    </div>
  );
}

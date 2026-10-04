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
    <div className="fixed inset-0 z-[500] flex items-end sm:items-center justify-center">
      {/* Backdrop: click to dismiss. */}
      <div
        className="absolute inset-0 bg-[var(--scrim)] backdrop-blur-[3px] animate-[fade-in_.24s_ease_both]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel: a bottom sheet on phones, a centred dialog from sm up. */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "relative w-full sm:w-[calc(100%-32px)] max-h-[calc(100dvh-24px)] overflow-y-auto",
          "bg-[var(--paper)] border border-[var(--line)] shadow-[var(--shadow-md)]",
          "rounded-t-[var(--r)] sm:rounded-[var(--r)]",
          "px-5 pt-6 pb-[calc(20px+env(safe-area-inset-bottom,0px))] sm:p-7",
          "animate-[slideUp_.32s_var(--ease)_both] focus-visible:outline-none"
        )}
        style={{ maxWidth }}
      >
        <h2
          id={titleId}
          className={cn("type-display text-[22px]", sub ? "mb-1.5" : "mb-5")}
        >
          {title}
        </h2>
        {sub ? (
          <p className="text-[14px] text-[var(--ink-2)] mb-5">{sub}</p>
        ) : null}
        {children}
      </div>
    </div>
  );
}

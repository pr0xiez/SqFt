"use client";

import { type ReactNode, useEffect } from "react";
import { cn } from "@/lib/cn";

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
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

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

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
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

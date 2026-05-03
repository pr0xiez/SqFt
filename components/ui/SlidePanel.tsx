"use client";

import { type ReactNode, useEffect } from "react";
import { cn } from "@/lib/cn";

interface SlidePanelProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  width?: string;
  children: ReactNode;
  side?: "right" | "bottom";
}

export function SlidePanel({
  open,
  onClose,
  title,
  width = "440px",
  children,
  side = "right",
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

  const isRight = side === "right";

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-[300] transition-opacity duration-200",
          "bg-black/40 backdrop-blur-[2px]",
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
          "fixed z-[400] bg-[var(--surface)] border border-[var(--line)]",
          "flex flex-col transition-transform duration-300 ease-out",
          // Mobile: bottom sheet
          "bottom-0 left-0 right-0 max-h-[85vh] rounded-t-xl border-b-0",
          "shadow-[var(--shadow-md)]",
          // Desktop right panel overrides
          isRight &&
            "md:inset-y-0 md:right-0 md:left-auto md:max-h-none md:w-auto md:rounded-none md:border-b",
          // Closed states
          !open && "translate-y-full",
          isRight && !open && "md:translate-y-0 md:translate-x-full",
          !isRight && !open && "md:translate-y-full"
        )}
        style={isRight ? { maxWidth: width } : undefined}
      >
        {/* Drag handle — mobile only */}
        <div className="md:hidden flex justify-center pt-2 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-[var(--line-2)]" />
        </div>

        {/* Header */}
        {title && (
          <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--line)] shrink-0">
            <h2 className="font-[var(--font-display)] font-[600] text-[15px] text-[var(--ink)] tracking-[-0.01em]">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="text-[var(--muted)] hover:text-[var(--ink)] transition-colors text-xl leading-none -mr-1 min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label="Close panel"
            >
              ✕
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </>
  );
}

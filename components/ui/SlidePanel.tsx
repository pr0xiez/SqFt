"use client";

import { useEffect, ReactNode } from "react";
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
  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const isRight = side === "right";

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 bg-oak/30 z-[300] transition-opacity duration-200",
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
          "fixed z-[400] bg-linen border-[1.5px] border-oak",
          "shadow-[-4px_0_24px_rgba(61,50,40,.2)]",
          "flex flex-col transition-transform duration-300 ease-out",
          isRight
            ? "top-0 right-0 h-full"
            : "bottom-0 left-0 right-0 max-h-[80vh] rounded-t-lg border-b-0",
          // Desktop: use width prop; mobile: full-width
          isRight && "w-full md:w-auto",
          !open &&
            (isRight ? "translate-x-full" : "translate-y-full")
        )}
        style={isRight ? { maxWidth: width } : undefined}
      >
        {/* Header */}
        {title && (
          <div className="flex items-center justify-between px-5 py-4 border-b-[1.5px] border-linen-dd shrink-0">
            <h2 className="font-[var(--font-display)] font-bold text-base text-oak">
              {title}
            </h2>
            <button
              onClick={onClose}
              className="text-driftwood hover:text-oak transition-colors text-xl leading-none p-1 -mr-1"
              aria-label="Close panel"
            >
              ✕
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {children}
        </div>
      </div>
    </>
  );
}

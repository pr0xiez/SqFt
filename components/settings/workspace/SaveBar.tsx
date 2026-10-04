"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";

type Props = {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onRevert: () => void;
};

export function SaveBar({ dirty, saving, onSave, onRevert }: Props) {
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  return (
    <div
      className={[
        "fixed left-1/2 -translate-x-1/2 z-[60]",
        "bottom-[calc(80px+env(safe-area-inset-bottom,0px))] md:bottom-6",
        "w-[calc(100%-28px)] max-w-[460px] md:w-auto md:max-w-none",
        "flex items-center justify-between gap-4 pl-4 pr-2 py-2",
        "bg-[var(--paper)] border border-[var(--line-2)] rounded-[var(--r)]",
        "shadow-[var(--shadow-md)] transition-[opacity,transform] duration-200 ease-[var(--ease)]",
        dirty
          ? "opacity-100 translate-y-0 pointer-events-auto"
          : "opacity-0 translate-y-3 pointer-events-none",
      ].join(" ")}
      role="status"
      aria-live="polite"
    >
      <span className="text-[14px] font-[560] text-[var(--ink)] whitespace-nowrap">
        Unsaved changes
      </span>
      <div className="flex gap-1.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRevert}
          disabled={saving}
        >
          Revert
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={onSave}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save workspace"}
        </Button>
      </div>
    </div>
  );
}

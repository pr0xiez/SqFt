"use client";

import { useEffect } from "react";

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
        "fixed bottom-6 left-1/2 -translate-x-1/2 z-[60]",
        "flex items-center gap-3.5 px-4 py-2.5",
        "bg-[var(--surface)] border border-[var(--line-2)] rounded-[10px]",
        "shadow-[var(--shadow-md)] transition-all duration-200",
        dirty
          ? "opacity-100 translate-y-0 pointer-events-auto"
          : "opacity-0 translate-y-3 pointer-events-none",
      ].join(" ")}
      role="status"
      aria-live="polite"
    >
      <span className="w-2 h-2 rounded-full bg-[var(--accent)]" />
      <span className="font-mono text-[11px] tracking-[.08em] uppercase text-[var(--ink-2)]">
        Unsaved changes
      </span>
      <div className="flex gap-2 ml-2">
        <button
          type="button"
          onClick={onRevert}
          disabled={saving}
          className="font-mono text-[10px] px-2.5 py-1.5 rounded bg-transparent border-0 text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)] cursor-pointer disabled:opacity-50"
        >
          Revert
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="font-mono text-[10px] px-3 py-1.5 rounded bg-[var(--ink)] text-[var(--bg)] border border-[var(--ink)] hover:bg-[var(--ink-2)] cursor-pointer disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save workspace"}
        </button>
      </div>
    </div>
  );
}

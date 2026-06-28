"use client";

import { useEffect, useRef, useState } from "react";
import {
  type QuickCreateKind,
  useQuickCreate,
} from "@/components/quick-create/QuickCreateProvider";
import { cn } from "@/lib/cn";

const ENTRIES: ReadonlyArray<{ kind: QuickCreateKind; label: string }> = [
  { kind: "estimate", label: "New estimate" },
  { kind: "invoice", label: "New invoice" },
];

/**
 * The "+ New" launcher: a button that drops a menu of quick-create actions.
 * `collapsed` renders the compact icon used in the collapsed sidebar rail; the
 * menu then opens to the side rather than below.
 */
export function NewMenu({ collapsed = false }: { collapsed?: boolean }) {
  const { open } = useQuickCreate();
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  function choose(kind: QuickCreateKind) {
    setMenuOpen(false);
    open(kind);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setMenuOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label="New"
        title="New"
        className={cn(
          "inline-flex items-center justify-center gap-[7px]",
          "font-[var(--font-mono)] text-[11px] font-[500] tracking-[.02em]",
          "text-white bg-[var(--accent)] border border-[var(--accent)] rounded-[6px]",
          "cursor-pointer hover:bg-[var(--accent-l)] transition-colors",
          collapsed ? "w-9 h-9 text-[15px]" : "w-full px-3.5 py-2"
        )}
      >
        {collapsed ? (
          "+"
        ) : (
          <>
            + New <span className="opacity-70">▾</span>
          </>
        )}
      </button>

      {menuOpen && (
        <div
          role="menu"
          className={cn(
            "absolute z-[300] w-[210px] p-[5px]",
            "bg-[var(--surface)] border border-[var(--line-2)] rounded-[8px]",
            "shadow-[0_8px_24px_rgba(26,26,23,0.12)]",
            collapsed ? "left-full top-0 ml-2" : "left-0 top-full mt-1.5"
          )}
        >
          {ENTRIES.map((e) => (
            <button
              key={e.kind}
              type="button"
              role="menuitem"
              onClick={() => choose(e.kind)}
              className="w-full text-left px-2.5 py-2.5 rounded-[6px] text-[13px] font-[600] text-[var(--ink)] cursor-pointer hover:bg-[var(--surface-2)]"
            >
              {e.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

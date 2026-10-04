"use client";

import { useEffect, useRef, useState } from "react";
import { QUICK_CREATE_ENTRIES } from "@/components/quick-create/entries";
import {
  type QuickCreateKind,
  useQuickCreate,
} from "@/components/quick-create/QuickCreateProvider";
import { buttonClasses } from "@/components/ui/Button";
import { CaretDownIcon, PlusIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

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
        className={buttonClasses({
          variant: "primary",
          size: "md",
          className: collapsed
            ? "size-10 px-0"
            : "w-full justify-between pl-3.5 pr-3",
        })}
      >
        {collapsed ? (
          <PlusIcon aria-hidden="true" weight="bold" />
        ) : (
          <>
            <span className="inline-flex items-center gap-2">
              <PlusIcon aria-hidden="true" weight="bold" />
              New
            </span>
            <CaretDownIcon
              aria-hidden="true"
              className={cn(
                "size-[14px]! opacity-70 transition-transform duration-200",
                menuOpen && "rotate-180"
              )}
            />
          </>
        )}
      </button>

      {menuOpen && (
        <div
          role="menu"
          className={cn(
            "absolute z-[300] w-[248px] p-1.5",
            "bg-[var(--paper)] border border-[var(--line)] rounded-[var(--r)]",
            "shadow-[var(--shadow-md)] animate-[slideDown_.2s_var(--ease)_both]",
            collapsed ? "left-full top-0 ml-2" : "left-0 top-full mt-1.5"
          )}
        >
          {QUICK_CREATE_ENTRIES.map((e) => {
            const EntryIcon = e.icon;
            return (
              <button
                key={e.kind}
                type="button"
                role="menuitem"
                onClick={() => choose(e.kind)}
                className="w-full flex items-center gap-2.5 text-left px-2.5 h-10 rounded-[var(--r-in)] text-[14px] font-[560] text-[var(--ink)] cursor-pointer hover:bg-[var(--hover)]"
              >
                <EntryIcon
                  aria-hidden="true"
                  className="size-[17px] text-[var(--muted)]"
                />
                {e.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

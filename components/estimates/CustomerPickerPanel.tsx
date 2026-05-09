"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import type { Customer } from "@/lib/hooks/useCustomers";

interface Props {
  customers: Customer[];
  currentCustomerId: number;
  anchorRect: DOMRect;
  onSelect: (customerId: number) => void;
  onClose: () => void;
}

const PANEL_WIDTH = 340;
const PANEL_GAP = 6;
const VIEWPORT_PAD = 12;

export function CustomerPickerPanel({
  customers,
  currentCustomerId,
  anchorRect,
  onSelect,
  onClose,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKey);
    searchRef.current?.focus();
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  const top = anchorRect.bottom + PANEL_GAP;
  const left =
    typeof window !== "undefined"
      ? Math.max(
          VIEWPORT_PAD,
          Math.min(
            anchorRect.right - PANEL_WIDTH,
            window.innerWidth - PANEL_WIDTH - VIEWPORT_PAD
          )
        )
      : anchorRect.left;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) => {
      const fields = [c.name, c.phone, c.email, c.address];
      return fields.some(
        (f) => typeof f === "string" && f.toLowerCase().includes(q)
      );
    });
  }, [customers, query]);

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Change customer"
      style={{ top, left, width: PANEL_WIDTH }}
      className="fixed z-[601] bg-[var(--surface)] border border-[var(--line)] rounded-lg shadow-lg overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[var(--line)] bg-[var(--surface-2)]">
        <div className="font-[var(--font-mono)] text-[11px] uppercase tracking-[.06em] text-[var(--muted)]">
          Change customer
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="bg-transparent border-none text-[var(--muted)] cursor-pointer text-[14px] leading-none hover:text-[var(--ink)] px-1"
        >
          ✕
        </button>
      </div>

      {/* Search */}
      <div className="px-3.5 py-2.5 border-b border-[var(--line)]">
        <input
          ref={searchRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, phone, email, address…"
          className="w-full font-[var(--font-mono)] text-[12px] py-[7px] px-2.5 border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] rounded-[6px] tracking-[.01em] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--ink-2)]"
        />
      </div>

      {/* Body */}
      <div className="max-h-[280px] overflow-y-auto">
        {filtered.length > 0 ? (
          filtered.map((c) => {
            const isCurrent = c.id === currentCustomerId;
            return (
              <button
                key={c.id}
                type="button"
                disabled={isCurrent}
                onClick={() => {
                  if (isCurrent) return;
                  onSelect(c.id);
                  onClose();
                }}
                className={cn(
                  "w-full flex flex-col items-start gap-0.5 px-3.5 py-2.5 border-b border-[var(--line)] last:border-b-0 text-left transition-colors duration-[120ms]",
                  isCurrent
                    ? "bg-[rgba(61,107,74,0.06)] border-l-[3px] border-l-[var(--sage)] cursor-default"
                    : "hover:bg-[var(--surface-2)] border-l-[3px] border-l-transparent cursor-pointer"
                )}
              >
                <span className="text-[13px] font-[600] tracking-[-0.01em]">
                  {c.name}
                  {isCurrent ? (
                    <span className="ml-2 font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.06em] font-[400]">
                      current
                    </span>
                  ) : null}
                </span>
                {c.address ? (
                  <span className="font-[var(--font-mono)] text-[11px] text-[var(--muted)]">
                    {c.address}
                  </span>
                ) : null}
              </button>
            );
          })
        ) : (
          <div className="px-3.5 py-5 text-center font-[var(--font-mono)] text-[11px] text-[var(--muted)]">
            {query.trim() ? `No customers match "${query}".` : "No customers."}
          </div>
        )}
      </div>
    </div>
  );
}

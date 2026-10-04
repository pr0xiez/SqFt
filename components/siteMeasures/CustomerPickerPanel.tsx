"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { buttonClasses } from "@/components/ui/Button";
import { XIcon } from "@/components/ui/icons";
import { Tag } from "@/components/ui/StatusBadge";
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
      const fields = [c.name, c.phone, c.email];
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
      className="fixed z-[300] max-w-[calc(100vw-24px)] bg-[var(--paper)] border border-[var(--line)] rounded-[var(--r)] shadow-[var(--shadow-md)] overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 pl-4 pr-2 py-2 border-b border-[var(--line)]">
        <div className="text-[14.5px] font-[600]">Change customer</div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className={buttonClasses({
            variant: "ghost",
            size: "icon-sm",
          })}
        >
          <XIcon aria-hidden="true" />
        </button>
      </div>

      {/* Search */}
      <div className="px-4 py-3 border-b border-[var(--line)]">
        <input
          ref={searchRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, phone, email…"
          aria-label="Search customers"
          className="field min-h-[36px] h-[36px]"
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
                  "w-full flex flex-col items-start gap-0.5 px-4 py-2.5 min-h-[44px] border-b border-[var(--line)] last:border-b-0 text-left transition-colors duration-150",
                  isCurrent
                    ? "bg-[var(--surface-2)] cursor-default"
                    : "hover:bg-[var(--hover)] cursor-pointer"
                )}
              >
                <span className="flex items-center gap-2 text-[14px] font-[600] tracking-[-0.01em]">
                  {c.name}
                  {isCurrent ? <Tag>current</Tag> : null}
                </span>
                {c.phone ? (
                  <span className="type-figure text-[13px] text-[var(--muted)]">
                    {c.phone}
                  </span>
                ) : null}
              </button>
            );
          })
        ) : (
          <div className="px-4 py-5 text-center text-[13.5px] text-[var(--muted)]">
            {query.trim() ? `No customers match "${query}".` : "No customers."}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { SearchInput } from "@/components/ui/SearchInput";
import { SlidePanel } from "@/components/ui/SlidePanel";
import { cn } from "@/lib/cn";

/** One selectable record in the quick-create search results. */
export interface QuickRow {
  id: number;
  title: string;
  meta: string;
  /** Non-selectable rows render dimmed with an optional badge (e.g. "Draft"). */
  disabled?: boolean;
  badge?: string;
}

interface QuickCreatePanelProps {
  open: boolean;
  onClose: () => void;
  title: string;
  hint: string;
  placeholder: string;
  query: string;
  onQueryChange: (value: string) => void;
  rows: QuickRow[];
  loading: boolean;
  selectedId: number | null;
  onSelect: (id: number) => void;
  footerNote: string;
  createLabel: string;
  onCreate: () => void;
  createDisabled: boolean;
  creating: boolean;
}

const eyebrow =
  "font-[var(--font-mono)] text-[9px] tracking-[.06em] uppercase text-[var(--muted)]";

/**
 * Shared chrome for both quick-create flows: a customer search, a list of
 * linkable parent records, and a create footer. The container that wires data
 * (site measures for an estimate, billable estimates for an invoice) supplies
 * the rows and the create action — this component owns no data, only layout
 * and selection presentation.
 */
export function QuickCreatePanel({
  open,
  onClose,
  title,
  hint,
  placeholder,
  query,
  onQueryChange,
  rows,
  loading,
  selectedId,
  onSelect,
  footerNote,
  createLabel,
  onCreate,
  createDisabled,
  creating,
}: QuickCreatePanelProps) {
  return (
    <SlidePanel
      open={open}
      onClose={onClose}
      title={title}
      width="432px"
      footer={
        <div className="flex items-center justify-between gap-2 w-full">
          <span className={eyebrow}>{footerNote}</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="font-[var(--font-mono)] text-[11px] text-[var(--ink)] bg-[var(--surface)] border border-[var(--line)] rounded-[6px] px-4 py-[9px] whitespace-nowrap cursor-pointer hover:border-[var(--ink-2)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onCreate}
              disabled={createDisabled}
              className={cn(
                "font-[var(--font-mono)] text-[11px] rounded-[6px] px-4 py-[9px] border whitespace-nowrap",
                createDisabled
                  ? "text-[var(--muted)] bg-[var(--surface-2)] border-[var(--line)] cursor-not-allowed"
                  : "text-white bg-[var(--accent)] border-[var(--accent)] cursor-pointer hover:bg-[var(--accent-l)]"
              )}
            >
              {creating ? "Creating…" : createLabel}
            </button>
          </div>
        </div>
      }
    >
      <SearchInput
        value={query}
        onChange={onQueryChange}
        placeholder={placeholder}
        className="max-w-none"
      />
      <div className={cn(eyebrow, "mt-3 mb-3 mx-0.5")}>{hint}</div>

      {loading && rows.length === 0 ? (
        <div className="border border-dashed border-[var(--line-2)] rounded-[8px] py-6 text-center font-[var(--font-mono)] text-[11px] text-[var(--muted)]">
          Searching…
        </div>
      ) : rows.length === 0 ? (
        <div className="border border-dashed border-[var(--line-2)] rounded-[8px] py-6 text-center font-[var(--font-mono)] text-[11px] text-[var(--muted)]">
          {query.trim()
            ? `No matches for "${query.trim()}"`
            : "Search by customer name or number"}
        </div>
      ) : (
        <ul className="border border-[var(--line)] rounded-[8px] overflow-hidden">
          {rows.map((row, i) => {
            const selected = row.id === selectedId;
            return (
              <li key={row.id}>
                <button
                  type="button"
                  disabled={row.disabled}
                  onClick={() => onSelect(row.id)}
                  aria-pressed={selected}
                  className={cn(
                    "w-full text-left flex items-center gap-3 px-3.5 py-3 border-l-[3px]",
                    i > 0 && "border-t border-t-[var(--line)]",
                    selected
                      ? "border-l-[var(--sage)] bg-[var(--sage-wash)]"
                      : "border-l-transparent bg-[var(--surface)]",
                    row.disabled
                      ? "opacity-45 cursor-default"
                      : "cursor-pointer hover:bg-[var(--surface-2)]"
                  )}
                >
                  <span className="flex-1 min-w-0">
                    <span className="block text-[14px] font-[600] tracking-[-0.01em] truncate">
                      {row.title}
                    </span>
                    <span className="block font-[var(--font-mono)] text-[10px] text-[var(--muted)] mt-0.5 truncate">
                      {row.meta}
                    </span>
                  </span>
                  {selected && (
                    <span className="font-[var(--font-mono)] text-[10px] text-[var(--sage)] whitespace-nowrap">
                      ✓ Selected
                    </span>
                  )}
                  {!selected && row.badge && (
                    <span className="font-[var(--font-mono)] text-[9px] text-[var(--muted)] border border-[var(--line)] rounded-[4px] px-[7px] py-0.5 whitespace-nowrap">
                      {row.badge}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </SlidePanel>
  );
}

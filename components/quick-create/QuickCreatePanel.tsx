"use client";

import { Button } from "@/components/ui/Button";
import { ArrowRightIcon, CheckIcon } from "@/components/ui/icons";
import { SearchInput } from "@/components/ui/SearchInput";
import { SlidePanel } from "@/components/ui/SlidePanel";
import { Tag } from "@/components/ui/StatusBadge";
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
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 w-full">
          <span className="text-[13px] text-[var(--muted)]">{footerNote}</span>
          <div className="flex gap-2 ml-auto">
            <Button onClick={onClose}>Cancel</Button>
            <Button
              variant="primary"
              onClick={onCreate}
              disabled={createDisabled}
            >
              {creating ? "Creating…" : createLabel}
              {!creating && <ArrowRightIcon aria-hidden="true" />}
            </Button>
          </div>
        </div>
      }
    >
      <SearchInput
        value={query}
        onChange={onQueryChange}
        placeholder={placeholder}
        className="max-w-none md:max-w-none"
      />
      <p className="text-[13px] text-[var(--muted)] mt-3 mb-3">{hint}</p>

      {loading && rows.length === 0 ? (
        <div className={EMPTY_BOX}>Searching…</div>
      ) : rows.length === 0 ? (
        <div className={EMPTY_BOX}>
          {query.trim()
            ? `No matches for "${query.trim()}"`
            : "Search by customer name or number"}
        </div>
      ) : (
        <ul className="border border-[var(--line)] rounded-[var(--r)] overflow-hidden bg-[var(--surface)]">
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
                    "w-full text-left flex items-center gap-3 px-3.5 py-3 min-h-[60px] border-l-[3px] transition-colors",
                    i > 0 && "border-t border-t-[var(--line)]",
                    selected
                      ? "border-l-[var(--ok)] bg-[color-mix(in_oklab,var(--ok)_10%,transparent)]"
                      : "border-l-transparent",
                    row.disabled
                      ? "opacity-50 cursor-default"
                      : "cursor-pointer hover:bg-[var(--hover)]"
                  )}
                >
                  <span className="flex-1 min-w-0">
                    <span className="block text-[14.5px] font-[600] tracking-[-0.01em] truncate">
                      {row.title}
                    </span>
                    <span className="block text-[13px] text-[var(--muted)] mt-0.5 truncate">
                      {row.meta}
                    </span>
                  </span>
                  {selected && (
                    <span className="inline-flex items-center gap-1 text-[13px] font-[600] text-[var(--ok)] whitespace-nowrap">
                      <CheckIcon
                        aria-hidden="true"
                        weight="bold"
                        className="size-[14px]"
                      />
                      Selected
                    </span>
                  )}
                  {!selected && row.badge && <Tag>{row.badge}</Tag>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </SlidePanel>
  );
}

const EMPTY_BOX =
  "border border-dashed border-[var(--line-2)] rounded-[var(--r)] px-4 py-6 text-center text-[14px] text-[var(--muted)]";

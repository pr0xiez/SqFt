"use client";

import { useCallback, useMemo, useState } from "react";
import { LineItemRow } from "@/components/estimates/LineItemRow";
import { RoomLinkPicker } from "@/components/estimates/RoomLinkPicker";
import { DecimalInput } from "@/components/ui/DecimalInput";
import { computeEstimateView } from "@/lib/estimateView";
import type { LineItemTemplate } from "@/lib/hooks/useLineItemTemplates";
import type { LineItemCalc, RoomItem } from "@/lib/utils";
import { fmtDollar, QtyMode, roomSqft } from "@/lib/utils";

export interface EstimateSavePatch {
  lineItems?: LineItemCalc[];
  convenienceFeeRate?: number;
  markupPct?: number;
  depositPct?: number;
}

interface Props {
  lineItems: LineItemCalc[];
  rooms: RoomItem[];
  convenienceFeeRate: number;
  markupPct: number;
  depositPct: number;
  readOnly?: boolean;
  templates?: LineItemTemplate[];
  onSave: (patch: EstimateSavePatch) => Promise<void>;
}

let _liNextId = Date.now() + 100000;
function tempLiId() {
  return ++_liNextId;
}

export function LineItemSection({
  lineItems: initialLineItems,
  rooms,
  convenienceFeeRate: initialFee,
  markupPct: initialMarkup,
  depositPct: initialDeposit,
  readOnly = false,
  templates = [],
  onSave,
}: Props) {
  const [items, setItems] = useState<LineItemCalc[]>(initialLineItems);
  const [feePct, setFeePct] = useState(Math.round(initialFee * 1000) / 10);
  const [markupPct, setMarkupPct] = useState(initialMarkup);
  const [depositPctState, setDepositPctState] = useState(
    Math.round(initialDeposit * 1000) / 10
  );
  const [picker, setPicker] = useState<{
    lineId: number;
    rect: DOMRect;
  } | null>(null);

  const save = useCallback(
    async (patch: EstimateSavePatch) => {
      await onSave(patch);
    },
    [onSave]
  );

  function addItem() {
    if (readOnly) return;
    const newItems: LineItemCalc[] = [
      ...items,
      {
        id: tempLiId(),
        name: "New line item",
        description: null,
        rate: 0,
        qtyMode: QtyMode.Manual,
        qty: null,
        wastePct: 0,
        unitLabel: "sqft",
        linkedRoomIds: [],
        sortOrder: items.length,
      },
    ];
    setItems(newItems);
    save({ lineItems: newItems });
  }

  function applyTemplate(id: number, templateId: number) {
    if (readOnly) return;
    const tpl = templates.find((t) => t.id === templateId);
    if (!tpl) return;
    updateItem(id, {
      name: tpl.name,
      description: tpl.description ?? null,
      rate: tpl.rate,
      unitLabel: tpl.unitLabel,
    });
  }

  function removeItem(id: number) {
    if (readOnly) return;
    const newItems = items.filter((i) => i.id !== id);
    setItems(newItems);
    save({ lineItems: newItems });
  }

  function updateItem(id: number, patch: Partial<LineItemCalc>) {
    if (readOnly) return;
    const newItems = items.map((item) =>
      item.id === id ? { ...item, ...patch } : item
    );
    setItems(newItems);
    save({ lineItems: newItems });
  }

  const view = useMemo(
    () =>
      computeEstimateView({
        lineItems: items,
        items: rooms,
        markupPct,
        convenienceFeeRate: feePct / 100,
        depositPct: depositPctState / 100,
      }),
    [items, rooms, markupPct, feePct, depositPctState]
  );
  const lineById = useMemo(
    () => new Map(view.lines.map((l) => [l.id, l])),
    [view.lines]
  );

  /** Commit a new subtotal value by back-calculating rate from effective qty.
   *  Preserves full precision on rate so qty * rate equals the entered subtotal
   *  exactly; the rate cell renders via toFixed(2) for display. */
  function commitSubtotal(li: LineItemCalc, next: number | null) {
    if (readOnly) return;
    if (next === null || next < 0) return;
    const qty = lineById.get(li.id)?.effectiveQty ?? null;
    if (qty === null || qty === 0) return; // can't back-calculate
    updateItem(li.id, { rate: next / qty });
  }

  const {
    subtotal,
    markup: markupAmt,
    convenienceFee: feeAmt,
    total,
    deposit,
  } = view;
  const margin = total > 0 ? ((total - subtotal) / total) * 100 : 0;

  return (
    <div className="space-y-3.5">
      {/* Room summary */}
      {rooms.length > 0 && (
        <div className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] tracking-[.04em] mb-2.5">
          AVAILABLE ROOMS ·{" "}
          {rooms
            .map((r) => `${r.name} (${Math.round(roomSqft(r))} sqft)`)
            .join(" · ")}
        </div>
      )}

      {/* Line items table */}
      <div className="bg-[var(--surface)] border border-[var(--line)] rounded-lg overflow-hidden">
        {/* Header */}
        <div className="hidden md:grid grid-cols-[2fr_1.1fr_1fr_1fr_1fr_40px] bg-[var(--surface-2)] border-b border-[var(--line)]">
          {["Description", "Scope", "Quantity", "Rate", "Subtotal", ""].map(
            (h) => (
              <div
                key={h}
                className="px-3.5 py-2.5 font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.06em]"
              >
                {h}
              </div>
            )
          )}
        </div>

        {/* Rows */}
        {items.length === 0 ? (
          <div className="p-6 text-center font-[var(--font-mono)] text-[12px] text-[var(--muted)]">
            No line items yet — add one to begin pricing.
          </div>
        ) : (
          items.map((li) => {
            const lineView = lineById.get(li.id);
            return (
              <LineItemRow
                key={li.id}
                li={li}
                effectiveQty={lineView?.effectiveQty ?? null}
                subtotal={lineView?.subtotal ?? null}
                rooms={rooms}
                templates={templates}
                readOnly={readOnly}
                onUpdate={(patch) => updateItem(li.id, patch)}
                onRemove={() => removeItem(li.id)}
                onCommitSubtotal={(next) => commitSubtotal(li, next)}
                onSaveBlur={() => save({ lineItems: items })}
                onOpenPicker={(rect) => setPicker({ lineId: li.id, rect })}
                onApplyTemplate={(templateId) =>
                  applyTemplate(li.id, templateId)
                }
              />
            );
          })
        )}

        {/* Calc section */}
        {items.length > 0 && (
          <div className="border-t border-[var(--line)] bg-[var(--surface-2)]">
            {/* Subtotal */}
            <div className="grid grid-cols-[2fr_1.1fr_1fr_1fr_1fr_40px] items-center border-b border-[var(--line)]">
              <div className="px-3.5 py-2.5 font-[var(--font-mono)] text-[11px] text-[var(--muted)] uppercase tracking-[.04em] col-span-3">
                Subtotal
              </div>
              <div />
              <div className="px-3.5 py-2.5 text-[14px] font-[600]">
                {fmtDollar(subtotal)}
              </div>
              <div />
            </div>
            {/* Convenience fee */}
            <PctRow
              label="Convenience fee"
              valuePct={feePct}
              suffix={fmtDollar(feeAmt)}
              readOnly={readOnly}
              onCommit={(next) => {
                setFeePct(next);
                save({ convenienceFeeRate: next / 100 });
              }}
            />
            {/* Markup */}
            <PctRow
              label="Markup (on subtotal + fee)"
              valuePct={markupPct}
              suffix={fmtDollar(markupAmt)}
              readOnly={readOnly}
              onCommit={(next) => {
                setMarkupPct(next);
                save({ markupPct: next });
              }}
            />
            {/* Total */}
            <div className="grid grid-cols-[2fr_1.1fr_1fr_1fr_1fr_40px] items-center bg-[var(--ink)] text-[var(--bg)] [html[data-theme=dark]_&]:bg-[var(--surface-2)] [html[data-theme=dark]_&]:border-t [html[data-theme=dark]_&]:border-[var(--line)]">
              <div className="px-3.5 py-3.5 font-[var(--font-mono)] text-[11px] uppercase tracking-[.04em] opacity-80 col-span-4">
                Estimate total
              </div>
              <div className="px-3.5 py-3.5 text-[22px] font-[700] tracking-[-0.025em]">
                {fmtDollar(total)}
              </div>
              <div />
            </div>
            {/* Deposit + margin footer */}
            <div className="grid grid-cols-[2fr_1.1fr_1fr_1fr_1fr_40px] items-center border-t border-[var(--line)]">
              <div className="px-3.5 py-2.5 font-[var(--font-mono)] text-[11px] text-[var(--muted)] uppercase tracking-[.04em] col-span-2 flex items-center gap-2">
                <span>Deposit</span>
                <PctInline
                  value={depositPctState}
                  readOnly={readOnly}
                  onCommit={(next) => {
                    setDepositPctState(next);
                    save({ depositPct: next / 100 });
                  }}
                />
              </div>
              <div className="px-3.5 py-2.5 font-[var(--font-mono)] text-[11px] text-[var(--muted)] uppercase tracking-[.04em]">
                Margin {margin.toFixed(1)}%
              </div>
              <div />
              <div className="px-3.5 py-2.5 text-[13px] font-[600] text-[var(--sage)]">
                {fmtDollar(deposit)}
              </div>
              <div />
            </div>
          </div>
        )}
      </div>

      {/* Add line item button */}
      {!readOnly && (
        <button
          type="button"
          onClick={addItem}
          className="w-full py-[11px] font-[var(--font-mono)] text-[11px] text-[var(--muted)] bg-transparent border border-dashed border-[var(--line-2)] rounded-[6px] cursor-pointer transition-colors duration-150 hover:border-[var(--ink-2)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)]"
        >
          + Add Line Item
        </button>
      )}

      {picker &&
        (() => {
          const li = items.find((i) => i.id === picker.lineId);
          if (!li) return null;
          return (
            <RoomLinkPicker
              rooms={rooms}
              initialRoomIds={li.linkedRoomIds}
              initialWastePct={li.wastePct}
              anchorRect={picker.rect}
              onApply={(linkedRoomIds, wastePct, measure) =>
                updateItem(picker.lineId, {
                  qtyMode:
                    measure === "perimeter"
                      ? QtyMode.LinkedPerimeter
                      : QtyMode.LinkedArea,
                  linkedRoomIds,
                  wastePct,
                })
              }
              onClear={() =>
                updateItem(picker.lineId, {
                  qtyMode: QtyMode.Manual,
                  linkedRoomIds: [],
                  wastePct: 0,
                  qty: null,
                })
              }
              onClose={() => setPicker(null)}
            />
          );
        })()}
    </div>
  );
}

interface PctRowProps {
  label: string;
  valuePct: number;
  suffix: string;
  readOnly: boolean;
  onCommit: (nextPct: number) => void;
}

function PctRow({ label, valuePct, suffix, readOnly, onCommit }: PctRowProps) {
  return (
    <div className="grid grid-cols-[2fr_1.1fr_1fr_1fr_1fr_40px] items-center border-b border-[var(--line)]">
      <div className="px-3.5 py-2.5 font-[var(--font-mono)] text-[11px] text-[var(--muted)] uppercase tracking-[.04em] col-span-3">
        {label}
      </div>
      <div className="px-2 py-2 flex items-center gap-1.5">
        <PctInline value={valuePct} readOnly={readOnly} onCommit={onCommit} />
      </div>
      <div className="px-3.5 py-2.5 text-[14px] font-[600]">{suffix}</div>
      <div />
    </div>
  );
}

interface PctInlineProps {
  value: number;
  readOnly: boolean;
  onCommit: (next: number) => void;
}

function PctInline({ value, readOnly, onCommit }: PctInlineProps) {
  return (
    <>
      <DecimalInput
        value={value}
        onCommit={(next) => {
          if (next === null) return;
          const clamped = Math.max(0, Math.min(100, next));
          if (clamped !== value) onCommit(clamped);
        }}
        formatOnBlur={false}
        disabled={readOnly}
        className="w-[50px] font-[var(--font-mono)] text-[13px] font-[600] text-right bg-transparent border-none p-0 focus:outline-none focus:bg-[var(--surface)] disabled:cursor-default"
      />
      <span className="font-[var(--font-mono)] text-[10px] text-[var(--muted)]">
        %
      </span>
    </>
  );
}

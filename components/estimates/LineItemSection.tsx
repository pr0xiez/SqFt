"use client";

import { useCallback, useMemo, useState } from "react";
import { EstimateTotals } from "@/components/estimates/EstimateTotals";
import { LineItemRow } from "@/components/estimates/LineItemRow";
import { RoomLinkPicker } from "@/components/estimates/RoomLinkPicker";
import { computeEstimateView } from "@/lib/estimateView";
import type { LineItemTemplate } from "@/lib/hooks/useLineItemTemplates";
import type { LineItemCalc, RoomItem } from "@/lib/utils";
import { QtyMode, roomSqft } from "@/lib/utils";

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
          <EstimateTotals
            subtotal={subtotal}
            feePct={feePct}
            markupPct={markupPct}
            depositPct={depositPctState}
            feeAmt={feeAmt}
            markupAmt={markupAmt}
            total={total}
            deposit={deposit}
            margin={margin}
            readOnly={readOnly}
            onCommitFee={(next) => {
              setFeePct(next);
              save({ convenienceFeeRate: next / 100 });
            }}
            onCommitMarkup={(next) => {
              setMarkupPct(next);
              save({ markupPct: next });
            }}
            onCommitDeposit={(next) => {
              setDepositPctState(next);
              save({ depositPct: next / 100 });
            }}
          />
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

"use client";

import { useCallback, useState } from "react";
import { RoomLinkPicker } from "@/components/quotes/RoomLinkPicker";
import { DecimalInput } from "@/components/ui/DecimalInput";
import { cn } from "@/lib/cn";
import type { LineItemTemplate } from "@/lib/hooks/useLineItemTemplates";
import type { LineItemCalc, RoomItem } from "@/lib/utils";
import {
  fmtDollar,
  getEffectiveQty,
  isLinkedQtyMode,
  liSubtotal,
  QtyMode,
  roomSqft,
} from "@/lib/utils";

export interface QuoteSavePatch {
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
  onSave: (patch: QuoteSavePatch) => Promise<void>;
}

let _liNextId = Date.now() + 100000;
function tempLiId() {
  return ++_liNextId;
}

/** Normalize legacy "ft²" unit label to "sqft" for toggle UI. */
function normalizeUnit(label: string): "sqft" | "lf" | "other" {
  if (label === "sqft" || label === "ft²") return "sqft";
  if (label === "lf") return "lf";
  return "other";
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
    async (patch: QuoteSavePatch) => {
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

  /** Commit a new subtotal value by back-calculating rate from effective qty.
   *  Preserves full precision on rate so qty * rate equals the entered subtotal
   *  exactly; the rate cell renders via toFixed(2) for display. */
  function commitSubtotal(li: LineItemCalc, next: number | null) {
    if (readOnly) return;
    if (next === null || next < 0) return;
    const qty = getEffectiveQty(li, rooms);
    if (qty === null || qty === 0) return; // can't back-calculate
    updateItem(li.id, { rate: next / qty });
  }

  const subtotal = items.reduce((sum, li) => {
    const st = liSubtotal(li, rooms);
    return sum + (st ?? 0);
  }, 0);

  const feeAmt = subtotal * (feePct / 100);
  const markupAmt = (subtotal + feeAmt) * (markupPct / 100);
  const total = subtotal + feeAmt + markupAmt;
  const deposit = total * (depositPctState / 100);
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
            const effectiveQty = getEffectiveQty(li, rooms);
            const sub = liSubtotal(li, rooms);
            const linked =
              isLinkedQtyMode(li.qtyMode) && li.linkedRoomIds.length > 0;
            const linkedUnit =
              li.qtyMode === QtyMode.LinkedPerimeter ? "lf" : "sqft";
            const linkedRooms = rooms.filter((r) =>
              li.linkedRoomIds.includes(r.id)
            );
            const unitKind = normalizeUnit(li.unitLabel);
            const canEditSubtotal =
              !readOnly && effectiveQty !== null && effectiveQty > 0;

            return (
              <div
                key={li.id}
                className={cn(
                  "border-b border-[var(--line)] last:border-b-0 transition-[background] duration-[120ms] hover:bg-[var(--surface-2)]",
                  linked && "border-l-[3px] border-l-[var(--sage)]"
                )}
              >
                {/* Main row */}
                <div className="grid grid-cols-1 md:grid-cols-[2fr_1.1fr_1fr_1fr_1fr_40px] items-start">
                  <div className="px-3.5 py-[11px] space-y-1.5">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={li.name}
                        onChange={(e) =>
                          updateItem(li.id, { name: e.target.value })
                        }
                        onBlur={() => save({ lineItems: items })}
                        disabled={readOnly}
                        className="text-[14px] font-[500] flex-1 min-w-0 border-none bg-transparent p-0 focus:outline-none focus:bg-[var(--surface-2)] disabled:cursor-default"
                      />
                      {!readOnly && templates.length > 0 && (
                        <select
                          aria-label="Apply template"
                          value=""
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val) applyTemplate(li.id, Number(val));
                            e.target.value = "";
                          }}
                          className="font-[var(--font-mono)] text-[10px] px-1.5 py-1 border border-[var(--line)] rounded-[4px] bg-[var(--surface)] text-[var(--muted)] hover:border-[var(--ink-2)] hover:text-[var(--ink)] cursor-pointer"
                        >
                          <option value="">Use template…</option>
                          {templates.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                    <textarea
                      value={li.description ?? ""}
                      onChange={(e) =>
                        updateItem(li.id, {
                          description: e.target.value || null,
                        })
                      }
                      onBlur={() => save({ lineItems: items })}
                      disabled={readOnly}
                      placeholder={readOnly ? "" : "Description (optional)"}
                      rows={1}
                      className="text-[12px] text-[var(--muted)] w-full border-none bg-transparent p-0 resize-y focus:outline-none focus:bg-[var(--surface-2)] disabled:cursor-default placeholder:text-[var(--muted)] placeholder:opacity-60"
                    />
                  </div>
                  <div className="px-3 py-2">
                    <button
                      type="button"
                      onClick={(e) =>
                        !readOnly &&
                        setPicker({
                          lineId: li.id,
                          rect: e.currentTarget.getBoundingClientRect(),
                        })
                      }
                      disabled={readOnly}
                      className={cn(
                        "font-[var(--font-mono)] text-[10px] px-2.5 py-1 border rounded-[4px] transition-colors duration-150 inline-flex items-center gap-[5px]",
                        readOnly
                          ? "cursor-default opacity-70"
                          : "cursor-pointer",
                        linked
                          ? "border-[var(--sage)] text-[var(--sage)] bg-[rgba(61,107,74,0.08)]"
                          : "border-[var(--line)] text-[var(--muted)] hover:border-[var(--ink-2)] hover:text-[var(--ink)]"
                      )}
                    >
                      {linked
                        ? `🔗 ${linkedRooms.length} room${linkedRooms.length === 1 ? "" : "s"} · ${linkedUnit}`
                        : li.qtyMode === QtyMode.Manual
                          ? `Manual · ${li.unitLabel || ""}`
                          : "Set scope…"}
                    </button>
                  </div>
                  <div className="px-3.5 py-[11px]">
                    {linked ? (
                      <div className="flex items-baseline gap-[5px]">
                        <span className="text-[14px] font-[600] text-[var(--sage)]">
                          {effectiveQty !== null
                            ? effectiveQty.toFixed(1)
                            : "—"}
                        </span>
                        <span className="font-[var(--font-mono)] text-[10px] text-[var(--sage)] opacity-80">
                          {linkedUnit}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-baseline gap-2">
                        <DecimalInput
                          value={li.qty}
                          onCommit={(next) => updateItem(li.id, { qty: next })}
                          allowEmpty
                          disabled={readOnly}
                          className="w-[64px] text-[14px] font-[500] border-none bg-transparent p-0 focus:outline-none disabled:cursor-default"
                        />
                        {unitKind === "other" ? (
                          <span className="font-[var(--font-mono)] text-[10px] text-[var(--muted)]">
                            {li.unitLabel}
                          </span>
                        ) : (
                          <select
                            value={unitKind}
                            onChange={(e) =>
                              updateItem(li.id, { unitLabel: e.target.value })
                            }
                            disabled={readOnly}
                            className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] bg-transparent border-none focus:outline-none disabled:cursor-default cursor-pointer hover:text-[var(--ink)]"
                          >
                            <option value="sqft">sqft</option>
                            <option value="lf">lf</option>
                          </select>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="px-3.5 py-[11px] relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-[var(--font-mono)] text-[11px] text-[var(--muted)] pointer-events-none">
                      $
                    </span>
                    <DecimalInput
                      value={li.rate}
                      onCommit={(next) =>
                        updateItem(li.id, { rate: next ?? 0 })
                      }
                      formatOnBlur
                      disabled={readOnly}
                      className="w-full text-[14px] font-[500] pl-3 border-none bg-transparent p-0 focus:outline-none disabled:cursor-default"
                    />
                  </div>
                  <div className="px-3.5 py-[11px] relative">
                    {canEditSubtotal ? (
                      <>
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-[var(--font-mono)] text-[11px] text-[var(--muted)] pointer-events-none">
                          $
                        </span>
                        <DecimalInput
                          value={sub ?? 0}
                          onCommit={(next) => commitSubtotal(li, next)}
                          formatOnBlur
                          title="Edit subtotal — rate will be recalculated from quantity"
                          className={cn(
                            "w-full text-[14px] font-[600] tracking-[-0.01em] pl-3 border-none bg-transparent p-0 focus:outline-none",
                            sub && sub > 0 ? "text-[var(--accent)]" : ""
                          )}
                        />
                      </>
                    ) : (
                      <span
                        className={cn(
                          "text-[14px] font-[600] tracking-[-0.01em]",
                          sub && sub > 0 ? "text-[var(--accent)]" : ""
                        )}
                      >
                        ${(sub ?? 0).toFixed(2)}
                      </span>
                    )}
                  </div>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => removeItem(li.id)}
                      className="px-[11px] py-[11px] bg-transparent border-none text-[var(--muted)] cursor-pointer text-[14px] leading-none hover:text-[var(--accent)]"
                    >
                      ✕
                    </button>
                  )}
                  {readOnly && <div />}
                </div>

                {/* Room tags */}
                {linked && linkedRooms.length > 0 && (
                  <div className="px-3.5 py-[7px] bg-[var(--surface-2)] border-t border-[var(--line)] flex gap-1.5 flex-wrap items-center">
                    {linkedRooms.map((r) => (
                      <span
                        key={r.id}
                        className="font-[var(--font-mono)] text-[10px] px-2 py-0.5 border border-[var(--sage)] text-[var(--sage)] bg-[rgba(61,107,74,0.06)] rounded-[4px] inline-flex items-center gap-[5px]"
                      >
                        {r.name}{" "}
                        <span className="opacity-70">
                          ({Math.round(roomSqft(r))})
                        </span>
                      </span>
                    ))}
                    {li.wastePct > 0 && (
                      <span className="font-[var(--font-mono)] text-[10px] text-[var(--gold)] px-2 py-0.5 border border-[var(--gold)] bg-[rgba(176,122,26,0.06)] rounded-[4px] ml-1">
                        +{li.wastePct}% waste
                      </span>
                    )}
                  </div>
                )}
              </div>
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
                Quote total
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

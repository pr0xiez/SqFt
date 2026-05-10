"use client";

import { useCallback, useState } from "react";
import { RoomLinkPicker } from "@/components/quotes/RoomLinkPicker";
import { DecimalInput } from "@/components/ui/DecimalInput";
import { cn } from "@/lib/cn";
import type { LineItemCalc, RoomItem } from "@/lib/utils";
import { fmtDollar, getEffectiveQty, liSubtotal, roomSqft } from "@/lib/utils";

interface Props {
  lineItems: LineItemCalc[];
  rooms: RoomItem[];
  taxRate: number;
  markupPct: number;
  onSave: (lineItems: LineItemCalc[]) => Promise<void>;
}

let _liNextId = Date.now() + 100000;
function tempLiId() {
  return ++_liNextId;
}

export function LineItemSection({
  lineItems: initialLineItems,
  rooms,
  taxRate,
  markupPct,
  onSave,
}: Props) {
  const [items, setItems] = useState<LineItemCalc[]>(initialLineItems);
  const [picker, setPicker] = useState<{
    lineId: number;
    rect: DOMRect;
  } | null>(null);

  const save = useCallback(
    async (newItems: LineItemCalc[]) => {
      await onSave(newItems);
    },
    [onSave]
  );

  function addItem() {
    const newItems: LineItemCalc[] = [
      ...items,
      {
        id: tempLiId(),
        name: "New line item",
        rate: 0,
        qtyMode: "manual",
        qty: null,
        wastePct: 0,
        unitLabel: "sqft",
        linkedRoomIds: [],
        sortOrder: items.length,
      },
    ];
    setItems(newItems);
    save(newItems);
  }

  function removeItem(id: number) {
    const newItems = items.filter((i) => i.id !== id);
    setItems(newItems);
    save(newItems);
  }

  function updateItem(id: number, patch: Partial<LineItemCalc>) {
    const newItems = items.map((item) =>
      item.id === id ? { ...item, ...patch } : item
    );
    setItems(newItems);
    save(newItems);
  }

  const subtotal = items.reduce((sum, li) => {
    const st = liSubtotal(li, rooms);
    return sum + (st ?? 0);
  }, 0);

  const taxPct = taxRate * 100;
  const taxAmt = subtotal * taxRate;
  const markupAmt = (subtotal + taxAmt) * (markupPct / 100);
  const total = subtotal + taxAmt + markupAmt;

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
              li.qtyMode === "linked" && li.linkedRoomIds.length > 0;
            const linkedRooms = rooms.filter((r) =>
              li.linkedRoomIds.includes(r.id)
            );

            return (
              <div
                key={li.id}
                className={cn(
                  "border-b border-[var(--line)] last:border-b-0 transition-[background] duration-[120ms] hover:bg-[var(--surface-2)]",
                  linked && "border-l-[3px] border-l-[var(--sage)]"
                )}
              >
                {/* Main row */}
                <div className="grid grid-cols-1 md:grid-cols-[2fr_1.1fr_1fr_1fr_1fr_40px] items-center">
                  <div className="px-3.5 py-[11px]">
                    <input
                      type="text"
                      value={li.name}
                      onChange={(e) =>
                        updateItem(li.id, { name: e.target.value })
                      }
                      onBlur={() => save(items)}
                      className="text-[14px] font-[500] w-full border-none bg-transparent p-0 focus:outline-none focus:bg-[var(--surface-2)]"
                    />
                  </div>
                  <div className="px-3 py-2">
                    <button
                      type="button"
                      onClick={(e) =>
                        setPicker({
                          lineId: li.id,
                          rect: e.currentTarget.getBoundingClientRect(),
                        })
                      }
                      className={cn(
                        "font-[var(--font-mono)] text-[10px] px-2.5 py-1 border rounded-[4px] cursor-pointer transition-colors duration-150 inline-flex items-center gap-[5px]",
                        linked
                          ? "border-[var(--sage)] text-[var(--sage)] bg-[rgba(61,107,74,0.08)]"
                          : "border-[var(--line)] text-[var(--muted)] hover:border-[var(--ink-2)] hover:text-[var(--ink)]"
                      )}
                    >
                      {linked
                        ? `🔗 ${linkedRooms.length} room${linkedRooms.length === 1 ? "" : "s"}`
                        : li.qtyMode === "manual"
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
                          sqft
                        </span>
                      </div>
                    ) : (
                      <DecimalInput
                        value={li.qty}
                        onCommit={(next) => updateItem(li.id, { qty: next })}
                        allowEmpty
                        className="w-full text-[14px] font-[500] border-none bg-transparent p-0 focus:outline-none"
                      />
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
                      className="w-full text-[14px] font-[500] pl-3 border-none bg-transparent p-0 focus:outline-none"
                    />
                  </div>
                  <div
                    className={cn(
                      "px-3.5 py-[11px] text-[14px] font-[600] tracking-[-0.01em]",
                      sub && sub > 0 ? "text-[var(--accent)]" : ""
                    )}
                  >
                    ${(sub ?? 0).toFixed(2)}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(li.id)}
                    className="px-[11px] py-[11px] bg-transparent border-none text-[var(--muted)] cursor-pointer text-[14px] leading-none hover:text-[var(--accent)]"
                  >
                    ✕
                  </button>
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
              <div className="px-3.5 py-2.5 text-[14px] font-[600]">
                {fmtDollar(subtotal)}
              </div>
              <div />
              <div />
            </div>
            {/* Tax */}
            <div className="grid grid-cols-[2fr_1.1fr_1fr_1fr_1fr_40px] items-center border-b border-[var(--line)]">
              <div className="px-3.5 py-2.5 font-[var(--font-mono)] text-[11px] text-[var(--muted)] uppercase tracking-[.04em] col-span-3">
                Tax
              </div>
              <div className="px-2 py-2 flex items-center gap-1.5">
                <span className="font-[var(--font-mono)] text-[13px] font-[600]">
                  {taxPct.toFixed(1)}
                </span>
                <span className="font-[var(--font-mono)] text-[10px] text-[var(--muted)]">
                  %
                </span>
              </div>
              <div className="px-3.5 py-2.5 text-[14px] font-[600]">
                {fmtDollar(taxAmt)}
              </div>
              <div />
            </div>
            {/* Markup */}
            <div className="grid grid-cols-[2fr_1.1fr_1fr_1fr_1fr_40px] items-center border-b border-[var(--line)]">
              <div className="px-3.5 py-2.5 font-[var(--font-mono)] text-[11px] text-[var(--muted)] uppercase tracking-[.04em] col-span-3">
                Markup (on subtotal + tax)
              </div>
              <div className="px-2 py-2 flex items-center gap-1.5">
                <span className="font-[var(--font-mono)] text-[13px] font-[600]">
                  {markupPct}
                </span>
                <span className="font-[var(--font-mono)] text-[10px] text-[var(--muted)]">
                  %
                </span>
              </div>
              <div className="px-3.5 py-2.5 text-[14px] font-[600]">
                {fmtDollar(markupAmt)}
              </div>
              <div />
            </div>
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
          </div>
        )}
      </div>

      {/* Add line item button */}
      <button
        type="button"
        onClick={addItem}
        className="w-full py-[11px] font-[var(--font-mono)] text-[11px] text-[var(--muted)] bg-transparent border border-dashed border-[var(--line-2)] rounded-[6px] cursor-pointer transition-colors duration-150 hover:border-[var(--ink-2)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)]"
      >
        + Add Line Item
      </button>

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
              onApply={(linkedRoomIds, wastePct) =>
                updateItem(picker.lineId, {
                  qtyMode: "linked",
                  linkedRoomIds,
                  wastePct,
                })
              }
              onClear={() =>
                updateItem(picker.lineId, {
                  qtyMode: "manual",
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

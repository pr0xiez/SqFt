"use client";

import { useState, useCallback } from "react";
import type { Estimate } from "@/lib/hooks/useEstimates";
import type { RoomItem, LineItemCalc } from "@/lib/utils";
import { parsef, liSubtotal, getEffectiveQty, fmtDollar } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

interface Props {
  estimate: Estimate;
  onSave: (lineItems: LineItemCalc[]) => Promise<void>;
}

let _liNextId = Date.now() + 100000;
function tempLiId() { return ++_liNextId; }

export function LineItemSection({ estimate, onSave }: Props) {
  const [items, setItems] = useState<LineItemCalc[]>(estimate.lineItems ?? []);
  const rooms = (estimate.items ?? []).filter((i): i is RoomItem => i.type === "room");

  const save = useCallback(async (newItems: LineItemCalc[]) => {
    await onSave(newItems);
  }, [onSave]);

  function addItem() {
    const newItems: LineItemCalc[] = [
      ...items,
      {
        id: tempLiId(),
        name: "",
        rate: 0,
        qtyMode: "manual",
        qty: null,
        wastePct: 0,
        unitLabel: "ft²",
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

  const materialsTotal = items.reduce((sum, li) => {
    const st = liSubtotal(li, rooms);
    return sum + (st ?? 0);
  }, 0);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="font-[var(--font-display)] text-lg font-bold text-oak">
          Materials & Labor
        </h2>
        <Button size="sm" onClick={addItem}>+ Add Item</Button>
      </div>

      {/* Column headers (desktop) */}
      {items.length > 0 && (
        <div className="hidden md:grid grid-cols-[2fr_80px_80px_80px_100px_32px] gap-2 px-3 font-[var(--font-mono)] text-[9px] uppercase tracking-widest text-driftwood">
          <span>Description</span>
          <span>Qty</span>
          <span>Rate</span>
          <span>Waste %</span>
          <span className="text-right">Subtotal</span>
          <span />
        </div>
      )}

      {/* Line items */}
      {items.map((li) => {
        const effectiveQty = getEffectiveQty(li, rooms);
        const subtotal = liSubtotal(li, rooms);

        return (
          <div
            key={li.id}
            className="bg-cream border-[1.5px] border-oak shadow-[2px_2px_0_var(--manila)] p-3 space-y-2"
          >
            <div className="grid grid-cols-1 md:grid-cols-[2fr_80px_80px_80px_100px_32px] gap-2 items-end">
              {/* Description */}
              <input
                type="text"
                value={li.name}
                onChange={(e) => updateItem(li.id, { name: e.target.value })}
                onBlur={() => save(items)}
                placeholder="Item description"
                className="border-[1.5px] border-oak bg-linen px-2 py-1.5 font-[var(--font-mono)] text-xs text-oak focus:outline-none focus:border-vermil"
              />

              {/* Qty / Linked */}
              <div className="flex flex-col gap-0.5">
                <div className="flex gap-1">
                  <button
                    onClick={() => updateItem(li.id, { qtyMode: "manual" })}
                    className={cn(
                      "text-[9px] px-1.5 py-0.5 border font-[var(--font-mono)] uppercase",
                      li.qtyMode === "manual"
                        ? "bg-oak border-oak text-linen"
                        : "bg-linen border-sand text-driftwood"
                    )}
                  >M</button>
                  {rooms.length > 0 && (
                    <button
                      onClick={() => updateItem(li.id, { qtyMode: "linked" })}
                      className={cn(
                        "text-[9px] px-1.5 py-0.5 border font-[var(--font-mono)] uppercase",
                        li.qtyMode === "linked"
                          ? "bg-oak border-oak text-linen"
                          : "bg-linen border-sand text-driftwood"
                      )}
                    >↗</button>
                  )}
                </div>
                {li.qtyMode === "manual" ? (
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={li.qty ?? ""}
                    onChange={(e) => updateItem(li.id, { qty: parsef(e.target.value) })}
                    onBlur={() => save(items)}
                    placeholder="0"
                    className="w-full border-[1.5px] border-oak bg-linen px-2 py-1 font-[var(--font-mono)] text-xs text-oak text-right focus:outline-none focus:border-vermil"
                  />
                ) : (
                  <div className="font-[var(--font-mono)] text-xs text-driftwood px-2 py-1 border border-linen-dd text-right">
                    {effectiveQty !== null ? Math.round(effectiveQty * 10) / 10 : "—"}
                  </div>
                )}
              </div>

              {/* Rate */}
              <input
                type="number"
                min="0"
                step="0.01"
                value={li.rate}
                onChange={(e) => updateItem(li.id, { rate: parsef(e.target.value) ?? 0 })}
                onBlur={() => save(items)}
                placeholder="0.00"
                className="border-[1.5px] border-oak bg-linen px-2 py-1.5 font-[var(--font-mono)] text-xs text-oak text-right focus:outline-none focus:border-vermil"
              />

              {/* Waste % */}
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={li.wastePct}
                onChange={(e) => updateItem(li.id, { wastePct: parsef(e.target.value) ?? 0 })}
                onBlur={() => save(items)}
                placeholder="0"
                className="border-[1.5px] border-oak bg-linen px-2 py-1.5 font-[var(--font-mono)] text-xs text-oak text-right focus:outline-none focus:border-vermil"
              />

              {/* Subtotal */}
              <div className="font-[var(--font-mono)] text-xs text-oak text-right py-1.5 px-2">
                {subtotal !== null ? fmtDollar(subtotal) : "—"}
              </div>

              {/* Remove */}
              <button
                onClick={() => removeItem(li.id)}
                className="text-driftwood hover:text-vermil text-sm leading-none justify-self-center"
                aria-label="Remove line item"
              >
                ✕
              </button>
            </div>

            {/* Room link selector */}
            {li.qtyMode === "linked" && rooms.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1 border-t border-linen-dd">
                <span className="font-[var(--font-mono)] text-[9px] uppercase tracking-widest text-driftwood self-center">
                  Rooms:
                </span>
                {rooms.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => {
                      const linked = li.linkedRoomIds.includes(r.id)
                        ? li.linkedRoomIds.filter((rid) => rid !== r.id)
                        : [...li.linkedRoomIds, r.id];
                      updateItem(li.id, { linkedRoomIds: linked });
                    }}
                    className={cn(
                      "px-2 py-0.5 font-[var(--font-mono)] text-[9px] uppercase tracking-wider border",
                      li.linkedRoomIds.includes(r.id)
                        ? "bg-sage border-sage text-cream"
                        : "bg-linen border-sand text-driftwood hover:border-oak"
                    )}
                  >
                    {r.name ?? `Room ${r.id}`}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Total */}
      {items.length > 0 && (
        <div className="flex justify-end pt-2 border-t-2 border-oak">
          <span className="font-[var(--font-mono)] text-sm text-oak">
            Materials total:{" "}
            <strong className="font-[var(--font-display)] text-base">
              {fmtDollar(materialsTotal)}
            </strong>
          </span>
        </div>
      )}
    </div>
  );
}

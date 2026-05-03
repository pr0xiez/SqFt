"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import type { Estimate } from "@/lib/hooks/useEstimates";
import type { LineItemCalc, RoomItem } from "@/lib/utils";
import { fmtDollar, getEffectiveQty, liSubtotal, parsef } from "@/lib/utils";

interface Props {
  estimate: Estimate;
  onSave: (lineItems: LineItemCalc[]) => Promise<void>;
}

let _liNextId = Date.now() + 100000;
function tempLiId() {
  return ++_liNextId;
}

export function LineItemSection({ estimate, onSave }: Props) {
  const [items, setItems] = useState<LineItemCalc[]>(estimate.lineItems ?? []);
  const rooms = (estimate.items ?? []).filter(
    (i): i is RoomItem => i.type === "room"
  );

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
      <div className="flex items-center justify-between">
        <h2 className="font-[var(--font-display)] text-[15px] font-[600] text-[var(--ink)] tracking-[-0.01em]">
          Materials & labor
        </h2>
        <Button size="sm" onClick={addItem}>
          + Add item
        </Button>
      </div>

      {items.length > 0 && (
        <div className="hidden md:grid grid-cols-[2fr_80px_80px_80px_100px_32px] gap-2 px-3 bg-[var(--surface-2)] border-b border-[var(--line)] py-1.5 font-[var(--font-mono)] text-[9px] uppercase tracking-[.06em] text-[var(--muted)]">
          <span>Description</span>
          <span>Qty</span>
          <span>Rate</span>
          <span>Waste %</span>
          <span className="text-right">Subtotal</span>
          <span />
        </div>
      )}

      {items.map((li) => {
        const effectiveQty = getEffectiveQty(li, rooms);
        const subtotal = liSubtotal(li, rooms);

        return (
          <div
            key={li.id}
            className="bg-[var(--surface)] border border-[var(--line)] rounded-lg p-3 space-y-2"
          >
            <div className="grid grid-cols-1 md:grid-cols-[2fr_80px_80px_80px_100px_32px] gap-2 items-end">
              <input
                type="text"
                value={li.name}
                onChange={(e) => updateItem(li.id, { name: e.target.value })}
                onBlur={() => save(items)}
                placeholder="Item description"
                className="border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5 rounded-[6px] font-[var(--font-mono)] text-[12px] text-[var(--ink)] focus:outline-none focus:border-[var(--accent)] transition-[border-color] duration-[150ms]"
              />

              <div className="flex flex-col gap-0.5">
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => updateItem(li.id, { qtyMode: "manual" })}
                    className={cn(
                      "text-[9px] px-1.5 py-0.5 border rounded-[4px] font-[var(--font-mono)]",
                      "transition-[background,border-color,color] duration-[150ms]",
                      li.qtyMode === "manual"
                        ? "bg-[var(--ink)] border-[var(--ink)] text-[var(--bg)]"
                        : "bg-[var(--surface)] border-[var(--line)] text-[var(--muted)]"
                    )}
                  >
                    M
                  </button>
                  {rooms.length > 0 && (
                    <button
                      type="button"
                      onClick={() => updateItem(li.id, { qtyMode: "linked" })}
                      className={cn(
                        "text-[9px] px-1.5 py-0.5 border rounded-[4px] font-[var(--font-mono)]",
                        "transition-[background,border-color,color] duration-[150ms]",
                        li.qtyMode === "linked"
                          ? "bg-[var(--sage)] border-[var(--sage)] text-white"
                          : "bg-[var(--surface)] border-[var(--line)] text-[var(--muted)]"
                      )}
                    >
                      ↗
                    </button>
                  )}
                </div>
                {li.qtyMode === "manual" ? (
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={li.qty ?? ""}
                    onChange={(e) =>
                      updateItem(li.id, { qty: parsef(e.target.value) })
                    }
                    onBlur={() => save(items)}
                    placeholder="0"
                    className="w-full border border-[var(--line)] bg-[var(--surface)] px-2 py-1 rounded-[6px] font-[var(--font-mono)] text-[12px] text-[var(--ink)] text-right focus:outline-none focus:border-[var(--accent)] transition-[border-color] duration-[150ms]"
                  />
                ) : (
                  <div className="font-[var(--font-mono)] text-[12px] text-[var(--muted)] px-2 py-1 border border-[var(--line)] rounded-[6px] text-right">
                    {effectiveQty !== null
                      ? Math.round(effectiveQty * 10) / 10
                      : "—"}
                  </div>
                )}
              </div>

              <input
                type="number"
                min="0"
                step="0.01"
                value={li.rate}
                onChange={(e) =>
                  updateItem(li.id, { rate: parsef(e.target.value) ?? 0 })
                }
                onBlur={() => save(items)}
                placeholder="0.00"
                className="border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5 rounded-[6px] font-[var(--font-mono)] text-[12px] text-[var(--ink)] text-right focus:outline-none focus:border-[var(--accent)] transition-[border-color] duration-[150ms]"
              />

              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={li.wastePct}
                onChange={(e) =>
                  updateItem(li.id, { wastePct: parsef(e.target.value) ?? 0 })
                }
                onBlur={() => save(items)}
                placeholder="0"
                className="border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5 rounded-[6px] font-[var(--font-mono)] text-[12px] text-[var(--ink)] text-right focus:outline-none focus:border-[var(--accent)] transition-[border-color] duration-[150ms]"
              />

              <div className="font-[var(--font-mono)] text-[12px] text-[var(--ink-2)] text-right py-1.5 px-2">
                {subtotal !== null ? fmtDollar(subtotal) : "—"}
              </div>

              <button
                type="button"
                onClick={() => removeItem(li.id)}
                className="text-[var(--muted)] hover:text-[var(--accent)] text-sm leading-none justify-self-center transition-colors"
                aria-label="Remove line item"
              >
                ✕
              </button>
            </div>

            {li.qtyMode === "linked" && rooms.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1 border-t border-[var(--line)]">
                <span className="font-[var(--font-mono)] text-[9px] uppercase tracking-[.06em] text-[var(--muted)] self-center">
                  Rooms:
                </span>
                {rooms.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      const linked = li.linkedRoomIds.includes(r.id)
                        ? li.linkedRoomIds.filter((rid) => rid !== r.id)
                        : [...li.linkedRoomIds, r.id];
                      updateItem(li.id, { linkedRoomIds: linked });
                    }}
                    className={cn(
                      "px-2 py-0.5 font-[var(--font-mono)] text-[9px] tracking-[.02em] border rounded-[4px]",
                      "transition-[background,border-color,color] duration-[150ms]",
                      li.linkedRoomIds.includes(r.id)
                        ? "bg-[var(--sage)] border-[var(--sage)] text-white"
                        : "bg-[var(--surface)] border-[var(--line)] text-[var(--muted)] hover:border-[var(--ink-2)]"
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

      {items.length > 0 && (
        <div className="flex justify-end pt-2 border-t border-[var(--line)]">
          <span className="font-[var(--font-mono)] text-[12px] text-[var(--muted)]">
            Materials total:{" "}
            <strong className="font-[var(--font-display)] text-[14px] text-[var(--ink)] tracking-[-0.01em]">
              {fmtDollar(materialsTotal)}
            </strong>
          </span>
        </div>
      )}
    </div>
  );
}

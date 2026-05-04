"use client";

import { useCallback, useState } from "react";
import { cn } from "@/lib/cn";
import type { Estimate } from "@/lib/hooks/useEstimates";
import type { RoomItem } from "@/lib/utils";
import { roomSqft } from "@/lib/utils";

interface Props {
  estimate: Estimate;
  onSave: (items: RoomItem[]) => Promise<void>;
}

let _nextId = Date.now();
function tempId() {
  return ++_nextId;
}

export function RoomSection({ estimate, onSave }: Props) {
  const [items, setItems] = useState<RoomItem[]>(estimate.items ?? []);
  const [wasteFactor, setWasteFactor] = useState(1.1);

  const save = useCallback(
    async (newItems: RoomItem[]) => {
      await onSave(newItems);
    },
    [onSave]
  );

  function addRoom() {
    const newItems: RoomItem[] = [
      ...items,
      {
        id: tempId(),
        type: "room",
        name: "New Room",
        shape: "rect",
        w: null,
        l: null,
        lshapeData: null,
        note: "",
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

  function updateRoom(id: number, patch: Partial<RoomItem>) {
    const newItems = items.map((item) =>
      item.id === id ? { ...item, ...patch } : item
    );
    setItems(newItems);
    save(newItems);
  }

  const rooms = items.filter((i) => i.type === "room");
  const grossArea = rooms.reduce((s, r) => s + roomSqft(r), 0);
  const orderQty = Math.ceil(grossArea * wasteFactor);

  return (
    <div className="space-y-2.5 mb-3.5">
      {items.length === 0 && (
        <div className="bg-[var(--surface)] border border-[var(--line)] rounded-lg p-8 text-center font-[var(--font-mono)] text-[12px] text-[var(--muted)]">
          No rooms yet — add one to begin measuring.
        </div>
      )}

      {items.map((item) =>
        item.type === "room" ? (
          <div
            key={item.id}
            className={cn(
              "bg-[var(--surface)] border border-[var(--line)] rounded-lg p-[18px_20px]",
              "transition-colors duration-150",
              item.shape === "lshape" && "border-l-[3px] border-l-[var(--gold)]"
            )}
          >
            {/* Room header */}
            <div className="flex items-center gap-2.5 mb-3.5">
              <input
                type="text"
                value={item.name ?? ""}
                onChange={(e) => updateRoom(item.id, { name: e.target.value })}
                onBlur={() => save(items)}
                placeholder="Room name"
                className="flex-1 text-[15px] font-[600] tracking-[-0.01em] border-none bg-transparent p-[4px_0] border-b border-b-transparent focus:outline-none focus:border-b-[var(--ink-2)] transition-[border-color] duration-150"
              />
              <button
                type="button"
                onClick={() => removeItem(item.id)}
                className="font-[var(--font-mono)] text-[10px] px-2.5 py-[5px] border border-[var(--line)] bg-transparent text-[var(--muted)] rounded-[4px] cursor-pointer transition-colors duration-150 hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                Remove
              </button>
            </div>

            {/* Dimensions row */}
            <div className="flex items-center gap-2.5 mb-3">
              <span className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] min-w-[80px] tracking-[.04em]">
                Dimensions
              </span>
              <input
                type="number"
                value={item.l ?? ""}
                onChange={(e) =>
                  updateRoom(item.id, {
                    l: parseFloat(e.target.value) || undefined,
                  })
                }
                onBlur={() => save(items)}
                placeholder="L"
                className="w-16 text-[14px] font-[600] p-[5px_8px] border border-[var(--line)] rounded-[5px] bg-[var(--surface-2)] text-[var(--accent)] text-center focus:outline-none focus:border-[var(--accent)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="text-[14px] text-[var(--muted)]">×</span>
              <input
                type="number"
                value={item.w ?? ""}
                onChange={(e) =>
                  updateRoom(item.id, {
                    w: parseFloat(e.target.value) || undefined,
                  })
                }
                onBlur={() => save(items)}
                placeholder="W"
                className="w-16 text-[14px] font-[600] p-[5px_8px] border border-[var(--line)] rounded-[5px] bg-[var(--surface-2)] text-[var(--accent)] text-center focus:outline-none focus:border-[var(--accent)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="font-[var(--font-mono)] text-[11px] text-[var(--muted)]">
                ft
              </span>
              <div className="ml-auto text-[18px] font-[700] tracking-[-0.02em]">
                {roomSqft(item) > 0 ? (
                  `${Math.round(roomSqft(item))} sqft`
                ) : (
                  <span className="text-[var(--muted)] font-[400]">—</span>
                )}
              </div>
            </div>

            {/* Shape row */}
            <div className="flex items-center gap-2 mb-2.5">
              <span className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] min-w-[80px]">
                Shape
              </span>
              {(["rect", "lshape"] as const).map((shape) => (
                <button
                  key={shape}
                  type="button"
                  onClick={() => updateRoom(item.id, { shape })}
                  className={cn(
                    "font-[var(--font-mono)] text-[10px] px-2.5 py-1 border rounded-[4px] cursor-pointer tracking-[.04em] transition-colors duration-150",
                    item.shape === shape
                      ? shape === "lshape"
                        ? "bg-[var(--gold)] text-white border-[var(--gold)]"
                        : "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]"
                      : "bg-transparent text-[var(--muted)] border-[var(--line)] hover:border-[var(--ink-2)] hover:text-[var(--ink)]"
                  )}
                >
                  {shape === "rect" ? "Rectangle" : "L-shape"}
                </button>
              ))}
            </div>

            {/* Note */}
            <input
              type="text"
              value={item.note ?? ""}
              onChange={(e) => updateRoom(item.id, { note: e.target.value })}
              onBlur={() => save(items)}
              placeholder="Add note about this room…"
              className="w-full text-[13px] text-[var(--ink-2)] bg-transparent border-none border-b border-b-transparent p-[4px_0] italic focus:outline-none focus:border-b-[var(--line-2)] transition-[border-color] duration-150 placeholder:text-[var(--muted)]"
            />
          </div>
        ) : (
          <div
            key={item.id}
            className="flex items-start gap-2 px-4 py-2 bg-[var(--surface)] border border-[var(--line)] border-l-[3px] border-l-[var(--gold)] rounded-lg"
          >
            <textarea
              rows={2}
              value={item.text ?? ""}
              onChange={(e) => updateRoom(item.id, { text: e.target.value })}
              onBlur={() => save(items)}
              placeholder="Field note…"
              className="flex-1 font-[var(--font-mono)] text-[11px] text-[var(--ink)] bg-transparent focus:outline-none resize-none italic"
            />
            <button
              type="button"
              onClick={() => removeItem(item.id)}
              className="text-[var(--muted)] hover:text-[var(--accent)] text-sm leading-none mt-0.5 shrink-0"
              aria-label="Remove note"
            >
              ✕
            </button>
          </div>
        )
      )}

      {/* Add buttons */}
      <div className="flex gap-2 mt-3.5">
        <button
          type="button"
          onClick={addRoom}
          className="flex-1 py-[11px] font-[var(--font-mono)] text-[11px] text-[var(--muted)] bg-transparent border border-dashed border-[var(--line-2)] rounded-[6px] cursor-pointer transition-colors duration-150 hover:border-[var(--ink-2)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)]"
        >
          + Add Room
        </button>
        <button
          type="button"
          onClick={() => {
            const newItems: RoomItem[] = [
              ...items,
              { id: tempId(), type: "note", text: "" },
            ];
            setItems(newItems);
            save(newItems);
          }}
          className="flex-1 py-[11px] font-[var(--font-mono)] text-[11px] text-[var(--muted)] bg-transparent border border-dashed border-[var(--line-2)] rounded-[6px] cursor-pointer transition-colors duration-150 hover:border-[var(--ink-2)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)]"
        >
          + Add Note
        </button>
      </div>

      {/* Summary bar */}
      {rooms.length > 0 && (
        <div className="bg-[var(--ink)] text-[var(--bg)] p-[20px_24px] rounded-lg flex flex-wrap items-center justify-between gap-3.5 mt-3.5 [html[data-theme=dark]_&]:bg-[var(--surface-2)] [html[data-theme=dark]_&]:border [html[data-theme=dark]_&]:border-[var(--line)]">
          <div>
            <div className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] tracking-[.04em] mb-1">
              Gross area
            </div>
            <div className="text-[28px] font-[700] tracking-[-0.025em]">
              {grossArea > 0 ? `${Math.round(grossArea)} sqft` : "—"}
            </div>
          </div>
          <div>
            <div className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] tracking-[.04em] mb-1">
              Order qty
            </div>
            <div className="text-[28px] font-[700] tracking-[-0.025em] text-[var(--gold-l)]">
              {grossArea > 0 ? `${orderQty} sqft` : "—"}
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] tracking-[.04em]">
              Waste
            </span>
            <select
              value={wasteFactor.toFixed(2)}
              onChange={(e) => setWasteFactor(parseFloat(e.target.value))}
              className="font-[var(--font-mono)] text-[11px] px-2.5 py-1.5 border border-white/20 bg-transparent text-[var(--bg)] rounded-[5px] cursor-pointer [html[data-theme=dark]_&]:text-[var(--ink)] [html[data-theme=dark]_&]:border-[var(--line)]"
            >
              <option value="1.05">+5%</option>
              <option value="1.10">+10%</option>
              <option value="1.15">+15%</option>
              <option value="1.20">+20%</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
}

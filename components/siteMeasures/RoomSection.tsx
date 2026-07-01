"use client";

import { useCallback, useState } from "react";
import type { SiteMeasure } from "@/lib/hooks/useSiteMeasures";
import type { RoomItem, RoomSegment } from "@/lib/utils";
import { roomSegments, roomSqft } from "@/lib/utils";

interface Props {
  siteMeasure: SiteMeasure;
  onSave: (items: RoomItem[]) => Promise<void>;
}

let _nextId = Date.now();
function tempId() {
  return ++_nextId;
}

/** Normalize a persisted room to the segments representation the editor uses:
 *  legacy w/l become a single box, and the scalar w/l are cleared. */
function toSegmentRoom(item: RoomItem): RoomItem {
  if (item.type !== "room") return item;
  return { ...item, segments: roomSegments(item), w: null, l: null };
}

function segmentSqft(seg: RoomSegment): number {
  const w = typeof seg.w === "number" ? seg.w : Number(seg.w);
  const l = typeof seg.l === "number" ? seg.l : Number(seg.l);
  if (!Number.isFinite(w) || !Number.isFinite(l)) return 0;
  return w * l;
}

export function RoomSection({ siteMeasure, onSave }: Props) {
  const [items, setItems] = useState<RoomItem[]>(() =>
    (siteMeasure.items ?? []).map(toSegmentRoom)
  );
  // Id of a just-added room whose name input should grab focus once.
  const [focusId, setFocusId] = useState<number | null>(null);

  const save = useCallback(
    async (newItems: RoomItem[]) => {
      await onSave(newItems);
    },
    [onSave]
  );

  function commit(newItems: RoomItem[]) {
    setItems(newItems);
    save(newItems);
  }

  function addRoom() {
    const id = tempId();
    commit([
      ...items,
      {
        id,
        type: "room",
        name: "New Room",
        shape: "rect",
        w: null,
        l: null,
        segments: [{ w: null, l: null }],
        note: "",
      },
    ]);
    setFocusId(id);
  }

  function removeItem(id: number) {
    commit(items.filter((i) => i.id !== id));
  }

  function updateRoom(id: number, patch: Partial<RoomItem>) {
    commit(
      items.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  }

  function updateSegment(
    room: RoomItem,
    idx: number,
    patch: Partial<RoomSegment>
  ) {
    const segments = roomSegments(room).map((s, i) =>
      i === idx ? { ...s, ...patch } : s
    );
    updateRoom(room.id, { segments, w: null, l: null });
  }

  function addSegment(room: RoomItem) {
    updateRoom(room.id, {
      segments: [...roomSegments(room), { w: null, l: null }],
      w: null,
      l: null,
    });
  }

  function removeSegment(room: RoomItem, idx: number) {
    const segments = roomSegments(room).filter((_, i) => i !== idx);
    updateRoom(room.id, { segments, w: null, l: null });
  }

  const rooms = items.filter((i) => i.type === "room");
  const grossArea = rooms.reduce((s, r) => s + roomSqft(r), 0);

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
            className="bg-[var(--surface)] border border-[var(--line)] rounded-lg p-[18px_20px] transition-colors duration-150"
          >
            {/* Room header */}
            <div className="flex items-center gap-2.5 mb-3.5">
              <input
                type="text"
                value={item.name ?? ""}
                ref={(el) => {
                  if (el && focusId === item.id) {
                    el.focus();
                    el.select();
                    setFocusId(null);
                  }
                }}
                onChange={(e) => updateRoom(item.id, { name: e.target.value })}
                placeholder="Room name"
                className="flex-1 text-[15px] font-[600] tracking-[-0.01em] border border-[var(--line)] bg-[var(--surface)] rounded-[5px] px-2.5 py-2 focus:outline-none focus:border-[var(--ink-2)] transition-[border-color] duration-150"
              />
              <button
                type="button"
                onClick={() => removeItem(item.id)}
                className="font-[var(--font-mono)] text-[10px] px-2.5 py-[5px] border border-[var(--line)] bg-transparent text-[var(--muted)] rounded-[4px] cursor-pointer transition-colors duration-150 hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                Remove
              </button>
            </div>

            {/* Dimensions — one row per box; areas sum to the room total */}
            <div className="space-y-2 mb-3">
              {roomSegments(item).map((seg, idx) => {
                const boxes = roomSegments(item);
                const sqft = segmentSqft(seg);
                return (
                  <div key={idx} className="flex items-center gap-2.5">
                    <span className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] min-w-[80px] tracking-[.04em]">
                      {idx === 0 ? "Dimensions" : ""}
                    </span>
                    <input
                      type="number"
                      value={seg.l ?? ""}
                      onChange={(e) =>
                        updateSegment(item, idx, {
                          l: parseFloat(e.target.value) || undefined,
                        })
                      }
                      placeholder="L"
                      className="w-16 text-[14px] font-[600] p-[5px_8px] border border-[var(--line)] rounded-[5px] bg-[var(--surface-2)] text-[var(--accent)] text-center focus:outline-none focus:border-[var(--accent)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="text-[14px] text-[var(--muted)]">×</span>
                    <input
                      type="number"
                      value={seg.w ?? ""}
                      onChange={(e) =>
                        updateSegment(item, idx, {
                          w: parseFloat(e.target.value) || undefined,
                        })
                      }
                      placeholder="W"
                      className="w-16 text-[14px] font-[600] p-[5px_8px] border border-[var(--line)] rounded-[5px] bg-[var(--surface-2)] text-[var(--accent)] text-center focus:outline-none focus:border-[var(--accent)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="font-[var(--font-mono)] text-[11px] text-[var(--muted)]">
                      ft
                    </span>
                    <div className="ml-auto text-[15px] font-[700] tracking-[-0.02em]">
                      {sqft > 0 ? (
                        `${Math.round(sqft)} sqft`
                      ) : (
                        <span className="text-[var(--muted)] font-[400]">
                          —
                        </span>
                      )}
                    </div>
                    {boxes.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeSegment(item, idx)}
                        aria-label="Remove dimension"
                        className="text-[var(--muted)] hover:text-[var(--accent)] text-sm leading-none shrink-0"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                );
              })}

              <div className="flex items-center gap-3 pl-[90px]">
                <button
                  type="button"
                  onClick={() => addSegment(item)}
                  className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] bg-transparent border-none p-0 cursor-pointer hover:text-[var(--ink)]"
                >
                  + dimension
                </button>
                {roomSegments(item).length > 1 && (
                  <div className="ml-auto flex items-center gap-2">
                    <span className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] tracking-[.04em]">
                      Room total
                    </span>
                    <span className="text-[18px] font-[700] tracking-[-0.02em]">
                      {roomSqft(item) > 0
                        ? `${Math.round(roomSqft(item))} sqft`
                        : "—"}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Note */}
            <input
              type="text"
              value={item.note ?? ""}
              onChange={(e) => updateRoom(item.id, { note: e.target.value })}
              placeholder="Add note about this room…"
              className="w-full text-[13px] text-[var(--ink-2)] bg-[var(--surface)] border border-[var(--line)] rounded-[5px] px-2.5 py-2 italic focus:outline-none focus:border-[var(--ink-2)] transition-[border-color] duration-150 placeholder:text-[var(--muted)]"
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
          onClick={() =>
            commit([...items, { id: tempId(), type: "note", text: "" }])
          }
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
        </div>
      )}
    </div>
  );
}

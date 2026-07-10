"use client";

import { useCallback, useState } from "react";
import { DecimalInput } from "@/components/ui/DecimalInput";
import type { SiteMeasure } from "@/lib/hooks/useSiteMeasures";
import type { RoomItem, RoomSegment } from "@/lib/utils";
import { roomSegments, roomSqft, segmentSqft } from "@/lib/utils";

interface Props {
  siteMeasure: SiteMeasure;
  onSave: (items: RoomItem[]) => Promise<void>;
}

let _nextId = Date.now();
function tempId() {
  return ++_nextId;
}

/** Editor-only segment: carries a stable `key` so React rows (and DecimalInput
 *  drafts) stay attached to the right box when one is removed. Stripped before
 *  save — the persisted shape is plain { w, l }. */
type EditorSegment = RoomSegment & { key: number };

type EditorItem = Omit<RoomItem, "segments"> & {
  segments?: EditorSegment[] | null;
};

const dimInputClass =
  "w-16 text-[14px] font-[600] p-[5px_8px] border border-[var(--line)] rounded-[5px] bg-[var(--surface-2)] text-[var(--accent)] text-center focus:outline-none focus:border-[var(--accent)]";

/** Normalize a persisted room to the segments representation the editor uses:
 *  legacy w/l become a single box, and the scalar w/l are cleared. (The repo
 *  re-canonicalizes on write, so a single box round-trips back to w/l.) */
function toEditorItem(item: RoomItem): EditorItem {
  if (item.type !== "room") return item as EditorItem;
  return {
    ...item,
    segments: roomSegments(item).map((s) => ({ ...s, key: tempId() })),
    w: null,
    l: null,
  };
}

/** Strip editor-only segment keys back off before handing items to onSave. */
function toSaveItems(items: EditorItem[]): RoomItem[] {
  return items.map((item) =>
    item.segments
      ? { ...item, segments: item.segments.map(({ w, l }) => ({ w, l })) }
      : (item as RoomItem)
  );
}

export function RoomSection({ siteMeasure, onSave }: Props) {
  const [items, setItems] = useState<EditorItem[]>(() =>
    (siteMeasure.items ?? []).map(toEditorItem)
  );
  // Id of a just-added room whose name input should grab focus once.
  const [focusId, setFocusId] = useState<number | null>(null);

  const save = useCallback(
    async (newItems: EditorItem[]) => {
      await onSave(toSaveItems(newItems));
    },
    [onSave]
  );

  function commit(newItems: EditorItem[]) {
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
        segments: [{ w: null, l: null, key: tempId() }],
        note: "",
      },
    ]);
    setFocusId(id);
  }

  function removeItem(id: number) {
    commit(items.filter((i) => i.id !== id));
  }

  function updateRoom(id: number, patch: Partial<EditorItem>) {
    commit(
      items.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  }

  function updateSegment(
    room: EditorItem,
    key: number,
    patch: Partial<RoomSegment>
  ) {
    const segments = (room.segments ?? []).map((s) =>
      s.key === key ? { ...s, ...patch } : s
    );
    updateRoom(room.id, { segments });
  }

  function addSegment(room: EditorItem) {
    updateRoom(room.id, {
      segments: [...(room.segments ?? []), { w: null, l: null, key: tempId() }],
    });
  }

  function removeSegment(room: EditorItem, key: number) {
    updateRoom(room.id, {
      segments: (room.segments ?? []).filter((s) => s.key !== key),
    });
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

      {items.map((item) => {
        if (item.type !== "room") {
          return (
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
          );
        }

        const boxes = item.segments ?? [];
        const roomTotal = roomSqft(item);
        return (
          <div
            key={item.id}
            className="bg-[var(--surface)] border border-[var(--line)] rounded-lg p-[18px_20px] transition-colors duration-150"
          >
            {/* Room header */}
            <div className="flex items-center gap-2.5 mb-3.5">
              <input
                type="text"
                value={item.name ?? ""}
                // Focus a just-added room's name once; the matching onFocus
                // clears focusId so later renders can't steal focus back (and
                // no setState runs during render).
                ref={(el) => {
                  if (el && focusId === item.id) {
                    el.focus();
                    el.select();
                  }
                }}
                onFocus={() => {
                  if (focusId === item.id) setFocusId(null);
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
              {boxes.map((seg, idx) => {
                const sqft = segmentSqft(seg);
                return (
                  <div key={seg.key} className="flex items-center gap-2.5">
                    <span className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] min-w-[80px] tracking-[.04em]">
                      {idx === 0 ? "Dimensions" : ""}
                    </span>
                    <DecimalInput
                      value={seg.l ?? null}
                      allowEmpty
                      onCommit={(n) => updateSegment(item, seg.key, { l: n })}
                      placeholder="L"
                      className={dimInputClass}
                    />
                    <span className="text-[14px] text-[var(--muted)]">×</span>
                    <DecimalInput
                      value={seg.w ?? null}
                      allowEmpty
                      onCommit={(n) => updateSegment(item, seg.key, { w: n })}
                      placeholder="W"
                      className={dimInputClass}
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
                        onClick={() => removeSegment(item, seg.key)}
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
                {boxes.length > 1 && (
                  <div className="ml-auto flex items-center gap-2">
                    <span className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] tracking-[.04em]">
                      Room total
                    </span>
                    <span className="text-[18px] font-[700] tracking-[-0.02em]">
                      {roomTotal > 0 ? `${Math.round(roomTotal)} sqft` : "—"}
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
        );
      })}

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

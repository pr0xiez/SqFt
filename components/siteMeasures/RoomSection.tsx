"use client";

import { useCallback, useState } from "react";
import { buttonClasses } from "@/components/ui/Button";
import { DecimalInput } from "@/components/ui/DecimalInput";
import { EmptyState } from "@/components/ui/EmptyState";
import { RulerIcon, TrashIcon, XIcon } from "@/components/ui/icons";
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
  "field type-figure min-h-[36px] h-[36px] w-[72px] px-2 text-center font-[600]";

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
    <div className="space-y-3 mb-4">
      {items.length === 0 && (
        <div className="card">
          <EmptyState
            icon={RulerIcon}
            title="No rooms yet."
            body="Add one to begin measuring."
            className="py-10"
          />
        </div>
      )}

      {items.map((item) => {
        if (item.type !== "room") {
          return (
            <div
              key={item.id}
              className="card flex items-start gap-2 pl-4 pr-2 py-2.5 shadow-[inset_3px_0_0_var(--warn)]"
            >
              <textarea
                rows={2}
                value={item.text ?? ""}
                onChange={(e) => updateRoom(item.id, { text: e.target.value })}
                placeholder="Field note…"
                className="field flex-1 min-h-[64px] bg-transparent border-transparent px-1 py-1.5 resize-none"
              />
              <button
                type="button"
                onClick={() => removeItem(item.id)}
                className={buttonClasses({
                  variant: "ghost",
                  size: "icon-sm",
                  className:
                    "text-[var(--muted)] hover:text-[var(--accent-ink)]",
                })}
                aria-label="Remove note"
              >
                <XIcon aria-hidden="true" />
              </button>
            </div>
          );
        }

        const boxes = item.segments ?? [];
        const roomTotal = roomSqft(item);
        return (
          <div key={item.id} className="card p-4 md:p-5">
            {/* Room header */}
            <div className="flex items-center gap-2 mb-4">
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
                className="field flex-1 min-w-0 w-auto font-[600]"
              />
              <button
                type="button"
                onClick={() => removeItem(item.id)}
                className={buttonClasses({
                  variant: "ghost",
                  size: "sm",
                  className:
                    "text-[var(--muted)] hover:text-[var(--accent-ink)]",
                })}
              >
                <TrashIcon aria-hidden="true" />
                Remove
              </button>
            </div>

            {/* Dimensions: one row per box; areas sum to the room total */}
            <div className="type-label mb-2">Dimensions</div>
            <div className="space-y-2 mb-4">
              {boxes.map((seg) => {
                const sqft = segmentSqft(seg);
                return (
                  <div key={seg.key} className="flex items-center gap-2">
                    <DecimalInput
                      value={seg.l ?? null}
                      allowEmpty
                      onCommit={(n) => updateSegment(item, seg.key, { l: n })}
                      placeholder="L"
                      className={dimInputClass}
                    />
                    <span
                      aria-hidden="true"
                      className="text-[14px] text-[var(--muted)]"
                    >
                      ×
                    </span>
                    <DecimalInput
                      value={seg.w ?? null}
                      allowEmpty
                      onCommit={(n) => updateSegment(item, seg.key, { w: n })}
                      placeholder="W"
                      className={dimInputClass}
                    />
                    <span className="text-[13px] text-[var(--muted)]">ft</span>
                    <div className="ml-auto type-figure text-[14.5px] font-[600] whitespace-nowrap">
                      {sqft > 0 ? (
                        `${Math.round(sqft)} sqft`
                      ) : (
                        <span className="text-[var(--muted)] font-[400]">
                          -
                        </span>
                      )}
                    </div>
                    {boxes.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeSegment(item, seg.key)}
                        aria-label="Remove dimension"
                        className={buttonClasses({
                          variant: "ghost",
                          size: "icon-sm",
                          className:
                            "text-[var(--muted)] hover:text-[var(--accent-ink)]",
                        })}
                      >
                        <XIcon aria-hidden="true" />
                      </button>
                    )}
                  </div>
                );
              })}

              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => addSegment(item)}
                  className={buttonClasses({
                    variant: "ghost",
                    size: "sm",
                    className: "-ml-2.5",
                  })}
                >
                  + dimension
                </button>
                {boxes.length > 1 && (
                  <div className="ml-auto flex items-baseline gap-2">
                    <span className="type-label">Room total</span>
                    <span className="type-figure text-[16px] font-[650]">
                      {roomTotal > 0 ? `${Math.round(roomTotal)} sqft` : "-"}
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
              aria-label="Room note"
              className="field text-[var(--ink-2)]"
            />
          </div>
        );
      })}

      {/* Add buttons */}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={addRoom}
          className={buttonClasses({
            variant: "default",
            className: "flex-1 border-dashed",
          })}
        >
          + Add Room
        </button>
        <button
          type="button"
          onClick={() =>
            commit([...items, { id: tempId(), type: "note", text: "" }])
          }
          className={buttonClasses({
            variant: "default",
            className: "flex-1 border-dashed",
          })}
        >
          + Add Note
        </button>
      </div>

      {/* Summary bar */}
      {rooms.length > 0 && (
        <div className="rounded-[var(--r)] bg-[var(--ink)] text-[var(--bg)] px-5 py-4 md:px-6 flex flex-wrap items-center justify-between gap-3.5">
          <div>
            <div className="text-[13.5px] font-[560] opacity-75 mb-1">
              Gross area
            </div>
            <div className="type-stat text-[28px] md:text-[32px]">
              {grossArea > 0 ? `${Math.round(grossArea)} sqft` : "-"}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

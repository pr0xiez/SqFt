"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { type RoomItem, roomSqft } from "@/lib/utils";

interface Props {
  rooms: RoomItem[];
  initialRoomIds: number[];
  initialWastePct: number;
  anchorRect: DOMRect;
  onApply: (roomIds: number[], wastePct: number) => void;
  onClear: () => void;
  onClose: () => void;
}

const PANEL_WIDTH = 340;
const PANEL_GAP = 6;
const VIEWPORT_PAD = 12;
const WASTE_OPTIONS = [0, 5, 10, 15, 20] as const;

export function RoomLinkPicker({
  rooms,
  initialRoomIds,
  initialWastePct,
  anchorRect,
  onApply,
  onClear,
  onClose,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [draftIds, setDraftIds] = useState<Set<number>>(
    () => new Set(initialRoomIds)
  );
  const [wastePct, setWastePct] = useState<number>(initialWastePct);

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  const top = anchorRect.bottom + PANEL_GAP;
  const left =
    typeof window !== "undefined"
      ? Math.max(
          VIEWPORT_PAD,
          Math.min(
            anchorRect.left,
            window.innerWidth - PANEL_WIDTH - VIEWPORT_PAD
          )
        )
      : anchorRect.left;

  const roomItems = useMemo(
    () => rooms.filter((r) => r.type === "room"),
    [rooms]
  );

  const baseSqft = useMemo(() => {
    return roomItems
      .filter((r) => draftIds.has(r.id))
      .reduce((sum, r) => sum + roomSqft(r), 0);
  }, [roomItems, draftIds]);

  const totalSqft = baseSqft * (1 + wastePct / 100);
  const selectedCount = draftIds.size;
  const hasRooms = roomItems.length > 0;

  function toggle(id: number) {
    setDraftIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleApply() {
    if (selectedCount === 0) return;
    onApply(Array.from(draftIds), wastePct);
    onClose();
  }

  function handleClear() {
    onClear();
    onClose();
  }

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Link rooms"
      style={{ top, left, width: PANEL_WIDTH }}
      className="fixed z-[601] bg-[var(--surface)] border border-[var(--line)] rounded-lg shadow-lg overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[var(--line)] bg-[var(--surface-2)]">
        <div className="font-[var(--font-mono)] text-[11px] uppercase tracking-[.06em] text-[var(--muted)]">
          Link rooms
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="bg-transparent border-none text-[var(--muted)] cursor-pointer text-[14px] leading-none hover:text-[var(--ink)] px-1"
        >
          ✕
        </button>
      </div>

      {/* Body */}
      <div className="max-h-[280px] overflow-y-auto">
        {hasRooms ? (
          roomItems.map((r) => {
            const checked = draftIds.has(r.id);
            const sqft = Math.round(roomSqft(r));
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => toggle(r.id)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3.5 py-2.5 border-b border-[var(--line)] last:border-b-0 cursor-pointer text-left transition-colors duration-[120ms]",
                  checked
                    ? "bg-[rgba(61,107,74,0.06)] border-l-[3px] border-l-[var(--sage)]"
                    : "hover:bg-[var(--surface-2)] border-l-[3px] border-l-transparent"
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  readOnly
                  tabIndex={-1}
                  className="accent-[var(--sage)] cursor-pointer"
                />
                <span className="text-[13px] font-[500] flex-1">
                  {r.name || "Untitled room"}
                </span>
                <span className="font-[var(--font-mono)] text-[11px] text-[var(--muted)]">
                  {sqft} sqft
                </span>
              </button>
            );
          })
        ) : (
          <div className="px-3.5 py-5 text-center font-[var(--font-mono)] text-[11px] text-[var(--muted)]">
            No rooms — add rooms in the estimate to enable room-linked items.
          </div>
        )}
      </div>

      {/* Waste row */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-t border-[var(--line)] bg-[var(--surface-2)]">
        <label
          htmlFor="rp-waste"
          className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] uppercase tracking-[.04em]"
        >
          Waste
        </label>
        <select
          id="rp-waste"
          value={wastePct}
          onChange={(e) => setWastePct(Number(e.target.value))}
          className="font-[var(--font-mono)] text-[11px] px-2 py-1 border border-[var(--line)] rounded-[4px] bg-[var(--surface)] text-[var(--ink)] cursor-pointer focus:outline-none focus:border-[var(--sage)]"
        >
          {WASTE_OPTIONS.map((v) => (
            <option key={v} value={v}>
              {v === 0 ? "0%" : `+${v}%`}
            </option>
          ))}
        </select>
      </div>

      {/* Preview */}
      <div className="px-3.5 py-2.5 border-t border-[var(--line)] font-[var(--font-mono)] text-[11px] text-[var(--muted)]">
        {selectedCount === 0 ? (
          "No rooms selected"
        ) : (
          <>
            <span className="text-[var(--ink)]">{selectedCount}</span> room
            {selectedCount === 1 ? "" : "s"} ·{" "}
            <span className="text-[var(--ink)]">{Math.round(baseSqft)}</span>{" "}
            sqft
            {wastePct > 0 ? (
              <>
                {" "}
                × {wastePct}% ={" "}
                <span className="text-[var(--sage)] font-[600]">
                  {totalSqft.toFixed(1)}
                </span>{" "}
                sqft
              </>
            ) : null}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 border-t border-[var(--line)] bg-[var(--surface-2)]">
        <button
          type="button"
          onClick={handleClear}
          className="font-[var(--font-mono)] text-[11px] px-2.5 py-1.5 bg-transparent border border-[var(--line)] rounded-[4px] text-[var(--muted)] cursor-pointer hover:text-[var(--ink)] hover:border-[var(--ink-2)]"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={handleApply}
          disabled={selectedCount === 0}
          className="font-[var(--font-mono)] text-[11px] px-3 py-1.5 border rounded-[4px] cursor-pointer transition-colors duration-150 border-[var(--sage)] text-white bg-[var(--sage)] hover:bg-[var(--sage-l)] hover:border-[var(--sage-l)] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Apply
        </button>
      </div>
    </div>
  );
}

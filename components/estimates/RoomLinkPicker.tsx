"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { buttonClasses } from "@/components/ui/Button";
import { XIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { type RoomItem, roomPerimeter, roomSqft } from "@/lib/utils";

type Measure = "area" | "perimeter";

interface Props {
  rooms: RoomItem[];
  initialRoomIds: number[];
  initialWastePct: number;
  anchorRect: DOMRect;
  onApply: (roomIds: number[], wastePct: number, measure: Measure) => void;
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
  const [measure, setMeasure] = useState<Measure>("area");

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

  const measureFn = measure === "perimeter" ? roomPerimeter : roomSqft;
  const unitLabel = measure === "perimeter" ? "lf" : "sqft";

  const baseAmount = useMemo(() => {
    return roomItems
      .filter((r) => draftIds.has(r.id))
      .reduce((sum, r) => sum + measureFn(r), 0);
  }, [roomItems, draftIds, measureFn]);

  const totalAmount = baseAmount * (1 + wastePct / 100);
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
    onApply(Array.from(draftIds), wastePct, measure);
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
      className="fixed z-[300] max-w-[calc(100vw-24px)] bg-[var(--paper)] border border-[var(--line)] rounded-[var(--r)] shadow-[var(--shadow-md)] overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 pl-4 pr-2 py-2 border-b border-[var(--line)]">
        <div className="text-[14.5px] font-[600]">Link rooms</div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className={buttonClasses({
            variant: "ghost",
            size: "icon-sm",
          })}
        >
          <XIcon aria-hidden="true" />
        </button>
      </div>

      {/* Body */}
      <div className="max-h-[280px] overflow-y-auto">
        {hasRooms ? (
          roomItems.map((r) => {
            const checked = draftIds.has(r.id);
            const amount = measureFn(r);
            const displayAmount =
              measure === "perimeter"
                ? amount.toFixed(1)
                : Math.round(amount).toString();
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => toggle(r.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 min-h-[44px] py-2 border-b border-[var(--line)] last:border-b-0 cursor-pointer text-left transition-colors duration-150",
                  checked
                    ? "bg-[color-mix(in_oklab,var(--ok)_9%,transparent)]"
                    : "hover:bg-[var(--hover)]"
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  readOnly
                  tabIndex={-1}
                  className="size-4 shrink-0 cursor-pointer"
                />
                <span className="text-[14px] font-[500] flex-1 min-w-0 truncate">
                  {r.name || "Untitled room"}
                </span>
                <span className="type-figure text-[13px] text-[var(--muted)]">
                  {displayAmount} {unitLabel}
                </span>
              </button>
            );
          })
        ) : (
          <div className="px-4 py-5 text-center text-[13.5px] text-[var(--muted)]">
            No rooms. Add rooms in the site measure to enable room-linked items.
          </div>
        )}
      </div>

      {/* Waste + measure */}
      <div className="px-4 py-3 border-t border-[var(--line)] space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="rp-waste" className="type-label">
            Waste
          </label>
          <select
            id="rp-waste"
            value={wastePct}
            onChange={(e) => setWastePct(Number(e.target.value))}
            className="field type-figure min-h-[34px] h-[34px] w-[96px] pl-2.5 pr-8 bg-[position:right_9px_center]"
          >
            {WASTE_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {v === 0 ? "0%" : `+${v}%`}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="type-label">Measure</span>
          <fieldset aria-label="Measure mode" className="seg m-0 min-w-0">
            <button
              type="button"
              onClick={() => setMeasure("area")}
              aria-pressed={measure === "area"}
            >
              Area (sqft)
            </button>
            <button
              type="button"
              onClick={() => setMeasure("perimeter")}
              aria-pressed={measure === "perimeter"}
            >
              Perimeter (lf)
            </button>
          </fieldset>
        </div>
      </div>

      {/* Preview */}
      <div className="px-4 py-2.5 border-t border-[var(--line)] text-[13.5px] text-[var(--muted)]">
        {selectedCount === 0 ? (
          "No rooms selected"
        ) : (
          <>
            <span className="type-figure text-[var(--ink)]">
              {selectedCount}
            </span>{" "}
            room
            {selectedCount === 1 ? "" : "s"} ·{" "}
            <span className="type-figure text-[var(--ink)]">
              {measure === "perimeter"
                ? baseAmount.toFixed(1)
                : Math.round(baseAmount)}
            </span>{" "}
            {unitLabel}
            {wastePct > 0 ? (
              <>
                {" "}
                × <span className="type-figure">{wastePct}%</span> ={" "}
                <span className="type-figure text-[var(--ok)] font-[600]">
                  {totalAmount.toFixed(1)}
                </span>{" "}
                {unitLabel}
              </>
            ) : null}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-[var(--line)]">
        <button
          type="button"
          onClick={handleClear}
          className={buttonClasses({ variant: "ghost", size: "sm" })}
        >
          Clear
        </button>
        <button
          type="button"
          onClick={handleApply}
          disabled={selectedCount === 0}
          className={buttonClasses({ variant: "primary", size: "sm" })}
        >
          Apply
        </button>
      </div>
    </div>
  );
}

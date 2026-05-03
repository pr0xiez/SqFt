"use client";

/**
 * RoomSection — renders room measurements and notes for an estimate.
 * Ports the room CRUD from flooring-prototype-v0_8.html.
 */

import { useCallback, useState } from "react";
import { RoomCanvas } from "@/components/estimates/RoomCanvas";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import type { Estimate } from "@/lib/hooks/useEstimates";
import type { RoomItem } from "@/lib/utils";
import { roomSqft } from "@/lib/utils";

interface Props {
  estimate: Estimate;
  onSave: (items: RoomItem[]) => Promise<void>;
}

let _nextId = Date.now(); // client-side temporary ID counter
function tempId() {
  return ++_nextId;
}

export function RoomSection({ estimate, onSave }: Props) {
  const [items, setItems] = useState<RoomItem[]>(estimate.items ?? []);
  const [_saving, setSaving] = useState(false);

  const save = useCallback(
    async (newItems: RoomItem[]) => {
      setSaving(true);
      try {
        await onSave(newItems);
      } finally {
        setSaving(false);
      }
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

  function addNote() {
    const newItems: RoomItem[] = [
      ...items,
      { id: tempId(), type: "note", text: "" },
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

  return (
    <div className="space-y-3">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <h2 className="font-[var(--font-display)] text-lg font-bold text-oak">
          Rooms & Measurements
        </h2>
        <div className="flex gap-2">
          <Button size="sm" onClick={addRoom}>
            + Room
          </Button>
          <Button size="sm" variant="ghost" onClick={addNote}>
            + Note
          </Button>
        </div>
      </div>

      {items.length === 0 && (
        <p className="font-[var(--font-mono)] text-xs text-driftwood italic py-2">
          No rooms yet. Add a room to start measuring.
        </p>
      )}

      {/* Room list */}
      <div className="space-y-3">
        {items.map((item) =>
          item.type === "note" ? (
            <NoteItem
              key={item.id}
              item={item}
              onUpdate={(text) => updateRoom(item.id, { text })}
              onRemove={() => removeItem(item.id)}
              onBlur={() => save(items)}
            />
          ) : (
            <RoomItemCard
              key={item.id}
              item={item}
              onUpdate={(patch) => updateRoom(item.id, patch)}
              onRemove={() => removeItem(item.id)}
              onBlur={() => save(items)}
            />
          )
        )}
      </div>

      {/* Total area */}
      {rooms.length > 0 && (
        <div className="flex justify-end pt-2 border-t border-linen-dd">
          <span className="font-[var(--font-mono)] text-xs text-driftwood">
            Total area:{" "}
            <strong className="text-oak">
              {Math.round(rooms.reduce((s, r) => s + roomSqft(r), 0))} ft²
            </strong>
          </span>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

interface RoomItemCardProps {
  item: RoomItem;
  onUpdate: (patch: Partial<RoomItem>) => void;
  onRemove: () => void;
  onBlur: () => void;
}

function RoomItemCard({ item, onUpdate, onRemove, onBlur }: RoomItemCardProps) {
  const area = roomSqft(item);

  return (
    <div className="bg-cream border-[1.5px] border-oak shadow-[2px_2px_0_var(--manila)] p-4 space-y-3">
      {/* Room header */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={item.name ?? ""}
          onChange={(e) => onUpdate({ name: e.target.value })}
          onBlur={onBlur}
          placeholder="Room name"
          className="flex-1 font-[var(--font-display)] font-bold text-sm text-oak bg-transparent border-b border-linen-dd focus:outline-none focus:border-oak pb-0.5"
        />
        <span className="font-[var(--font-mono)] text-xs text-driftwood shrink-0">
          {area > 0 ? `${Math.round(area * 10) / 10} ft²` : "—"}
        </span>
        <button
          onClick={onRemove}
          className="text-driftwood hover:text-vermil transition-colors text-sm leading-none ml-1"
          aria-label="Remove room"
        >
          ✕
        </button>
      </div>

      {/* Shape selector */}
      <div className="flex gap-1.5">
        {(["rect", "tri", "lshape"] as const).map((shape) => (
          <button
            key={shape}
            onClick={() => onUpdate({ shape })}
            className={cn(
              "px-3 py-1 font-[var(--font-mono)] text-[10px] uppercase tracking-wider border",
              item.shape === shape
                ? "bg-oak border-oak text-linen"
                : "bg-linen border-sand text-driftwood hover:border-oak"
            )}
          >
            {shape === "rect"
              ? "Rectangle"
              : shape === "tri"
                ? "Triangle"
                : "L-Shape"}
          </button>
        ))}
      </div>

      {/* Dimensions */}
      {item.shape !== "lshape" && (
        <div className="flex items-center gap-2">
          <DimInput
            label={item.shape === "tri" ? "Base" : "Width"}
            value={item.w ?? ""}
            onChange={(v) => onUpdate({ w: parseFloat(v) || undefined })}
            onBlur={onBlur}
          />
          <span className="text-driftwood font-[var(--font-mono)] text-sm">
            ×
          </span>
          <DimInput
            label={item.shape === "tri" ? "Height" : "Length"}
            value={item.l ?? ""}
            onChange={(v) => onUpdate({ l: parseFloat(v) || undefined })}
            onBlur={onBlur}
          />
          {item.shape === "tri" && (
            <span className="font-[var(--font-mono)] text-[10px] text-driftwood">
              ÷ 2
            </span>
          )}
        </div>
      )}

      {/* L-shape canvas preview */}
      {item.shape === "lshape" && (
        <LShapeEditor item={item} onUpdate={onUpdate} onBlur={onBlur} />
      )}

      {/* Canvas diagram */}
      {area > 0 && item.shape !== "lshape" && <RoomCanvas room={item} />}

      {/* Note */}
      <input
        type="text"
        value={item.note ?? ""}
        onChange={(e) => onUpdate({ note: e.target.value })}
        onBlur={onBlur}
        placeholder="Field note (optional)"
        className="w-full font-[var(--font-mono)] text-xs text-driftwood bg-transparent border-b border-linen-dd focus:outline-none focus:border-oak pb-0.5 italic placeholder:text-manila"
      />
    </div>
  );
}

function DimInput({
  label,
  value,
  onChange,
  onBlur,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  onBlur: () => void;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="font-[var(--font-mono)] text-[9px] uppercase tracking-widest text-driftwood">
        {label}
      </label>
      <input
        type="number"
        min="0"
        step="0.1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder="0"
        className="w-20 border-[1.5px] border-oak bg-linen px-2 py-1 font-[var(--font-mono)] text-sm text-oak focus:outline-none focus:border-vermil text-right"
      />
    </div>
  );
}

function LShapeEditor({
  item,
  onUpdate,
  onBlur,
}: {
  item: RoomItem;
  onUpdate: (patch: Partial<RoomItem>) => void;
  onBlur: () => void;
}) {
  const data = item.lshapeData ?? {
    sections: [
      { w: "", l: "" },
      { w: "", l: "" },
    ],
    deductions: [],
  };

  function updateSection(idx: number, field: "w" | "l", val: string) {
    const sections = data.sections.map((s, i) =>
      i === idx ? { ...s, [field]: val } : s
    );
    onUpdate({ lshapeData: { ...data, sections } });
  }

  function addSection() {
    onUpdate({
      lshapeData: { ...data, sections: [...data.sections, { w: "", l: "" }] },
    });
  }

  return (
    <div className="space-y-2">
      {data.sections.map((sec, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <span className="font-[var(--font-mono)] text-[10px] text-driftwood w-16">
            Section {idx + 1}
          </span>
          <DimInput
            label="W"
            value={sec.w}
            onChange={(v) => updateSection(idx, "w", v)}
            onBlur={onBlur}
          />
          <span className="text-driftwood">×</span>
          <DimInput
            label="L"
            value={sec.l}
            onChange={(v) => updateSection(idx, "l", v)}
            onBlur={onBlur}
          />
        </div>
      ))}
      <button
        onClick={addSection}
        className="font-[var(--font-mono)] text-[10px] text-driftwood hover:text-oak border border-dashed border-sand hover:border-oak px-3 py-1 transition-colors"
      >
        + Add section
      </button>
    </div>
  );
}

interface NoteItemProps {
  item: RoomItem;
  onUpdate: (text: string) => void;
  onRemove: () => void;
  onBlur: () => void;
}

function NoteItem({ item, onUpdate, onRemove, onBlur }: NoteItemProps) {
  return (
    <div className="flex items-start gap-2 px-4 py-2 bg-linen border border-linen-dd border-l-[3px] border-l-gold">
      <textarea
        rows={2}
        value={item.text ?? ""}
        onChange={(e) => onUpdate(e.target.value)}
        onBlur={onBlur}
        placeholder="Field note…"
        className="flex-1 font-[var(--font-mono)] text-xs text-oak bg-transparent focus:outline-none resize-none italic"
      />
      <button
        onClick={onRemove}
        className="text-driftwood hover:text-vermil text-sm leading-none mt-0.5 shrink-0"
        aria-label="Remove note"
      >
        ✕
      </button>
    </div>
  );
}

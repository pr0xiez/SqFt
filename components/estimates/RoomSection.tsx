"use client";

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

let _nextId = Date.now();
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
        name: "New room",
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
      <div className="flex items-center justify-between">
        <h2 className="font-[var(--font-display)] text-[15px] font-[600] text-[var(--ink)] tracking-[-0.01em]">
          Rooms & measurements
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
        <p className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] py-2">
          No rooms yet. Add a room to start measuring.
        </p>
      )}

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

      {rooms.length > 0 && (
        <div className="flex justify-end pt-2 border-t border-[var(--line)]">
          <span className="font-[var(--font-mono)] text-[11px] text-[var(--muted)]">
            Total area:{" "}
            <strong className="text-[var(--ink)]">
              {Math.round(rooms.reduce((s, r) => s + roomSqft(r), 0))} sf
            </strong>
          </span>
        </div>
      )}
    </div>
  );
}

interface RoomItemCardProps {
  item: RoomItem;
  onUpdate: (patch: Partial<RoomItem>) => void;
  onRemove: () => void;
  onBlur: () => void;
}

function RoomItemCard({ item, onUpdate, onRemove, onBlur }: RoomItemCardProps) {
  const area = roomSqft(item);

  return (
    <div className="bg-[var(--surface)] border border-[var(--line)] rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={item.name ?? ""}
          onChange={(e) => onUpdate({ name: e.target.value })}
          onBlur={onBlur}
          placeholder="Room name"
          className="flex-1 font-[var(--font-display)] font-[600] text-[14px] text-[var(--ink)] bg-transparent border-b border-transparent focus:outline-none focus:border-[var(--ink-2)] pb-0.5 transition-[border-color] duration-[150ms] tracking-[-0.01em]"
        />
        <span className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] shrink-0">
          {area > 0 ? `${Math.round(area * 10) / 10} sf` : "—"}
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="text-[var(--muted)] hover:text-[var(--accent)] transition-colors text-sm leading-none ml-1"
          aria-label="Remove room"
        >
          ✕
        </button>
      </div>

      <div className="flex gap-1.5">
        {(["rect", "tri", "lshape"] as const).map((shape) => (
          <button
            key={shape}
            type="button"
            onClick={() => onUpdate({ shape })}
            className={cn(
              "px-3 py-1 font-[var(--font-mono)] text-[10px] tracking-[.02em] border rounded-[4px]",
              "transition-[background,border-color,color] duration-[150ms]",
              item.shape === shape
                ? "bg-[var(--ink)] border-[var(--ink)] text-[var(--bg)]"
                : "bg-[var(--surface)] border-[var(--line)] text-[var(--muted)] hover:border-[var(--ink-2)]"
            )}
          >
            {shape === "rect"
              ? "Rectangle"
              : shape === "tri"
                ? "Triangle"
                : "L-shape"}
          </button>
        ))}
      </div>

      {item.shape !== "lshape" && (
        <div className="flex items-center gap-2">
          <DimInput
            label={item.shape === "tri" ? "Base" : "Width"}
            value={item.w ?? ""}
            onChange={(v) => onUpdate({ w: parseFloat(v) || undefined })}
            onBlur={onBlur}
          />
          <span className="text-[var(--muted)] font-[var(--font-mono)] text-sm">
            ×
          </span>
          <DimInput
            label={item.shape === "tri" ? "Height" : "Length"}
            value={item.l ?? ""}
            onChange={(v) => onUpdate({ l: parseFloat(v) || undefined })}
            onBlur={onBlur}
          />
          {item.shape === "tri" && (
            <span className="font-[var(--font-mono)] text-[10px] text-[var(--muted)]">
              ÷ 2
            </span>
          )}
        </div>
      )}

      {item.shape === "lshape" && (
        <LShapeEditor item={item} onUpdate={onUpdate} onBlur={onBlur} />
      )}

      {area > 0 && item.shape !== "lshape" && <RoomCanvas room={item} />}

      <input
        type="text"
        value={item.note ?? ""}
        onChange={(e) => onUpdate({ note: e.target.value })}
        onBlur={onBlur}
        placeholder="Field note (optional)"
        className="w-full font-[var(--font-mono)] text-[11px] text-[var(--muted)] bg-transparent border-b border-[var(--line)] focus:outline-none focus:border-[var(--ink-2)] pb-0.5 italic placeholder:text-[var(--line-2)] transition-[border-color] duration-[150ms]"
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
      <label className="font-[var(--font-mono)] text-[9px] uppercase tracking-[.06em] text-[var(--muted)]">
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
        className="w-20 border border-[var(--line)] bg-[var(--surface)] px-2 py-1 rounded-[6px] font-[var(--font-mono)] text-[13px] text-[var(--accent)] text-right focus:outline-none focus:border-[var(--accent)] transition-[border-color] duration-[150ms]"
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
        // biome-ignore lint/suspicious/noArrayIndexKey: stable order
        <div key={idx} className="flex items-center gap-2">
          <span className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] w-16">
            Section {idx + 1}
          </span>
          <DimInput
            label="W"
            value={sec.w}
            onChange={(v) => updateSection(idx, "w", v)}
            onBlur={onBlur}
          />
          <span className="text-[var(--muted)]">×</span>
          <DimInput
            label="L"
            value={sec.l}
            onChange={(v) => updateSection(idx, "l", v)}
            onBlur={onBlur}
          />
        </div>
      ))}
      <button
        type="button"
        onClick={addSection}
        className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] hover:text-[var(--ink)] border border-dashed border-[var(--line-2)] hover:border-[var(--ink-2)] px-3 py-1 rounded-[4px] transition-[border-color,color] duration-[150ms]"
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
    <div className="flex items-start gap-2 px-4 py-2 bg-[var(--surface)] border border-[var(--line)] border-l-[3px] border-l-[var(--gold)] rounded-lg">
      <textarea
        rows={2}
        value={item.text ?? ""}
        onChange={(e) => onUpdate(e.target.value)}
        onBlur={onBlur}
        placeholder="Field note…"
        className="flex-1 font-[var(--font-mono)] text-[11px] text-[var(--ink)] bg-transparent focus:outline-none resize-none italic"
      />
      <button
        type="button"
        onClick={onRemove}
        className="text-[var(--muted)] hover:text-[var(--accent)] text-sm leading-none mt-0.5 shrink-0"
        aria-label="Remove note"
      >
        ✕
      </button>
    </div>
  );
}

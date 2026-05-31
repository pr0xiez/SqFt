"use client";

import { DecimalInput } from "@/components/ui/DecimalInput";
import { cn } from "@/lib/cn";
import type { LineItemTemplate } from "@/lib/hooks/useLineItemTemplates";
import type { LineItemCalc, RoomItem } from "@/lib/utils";
import { isLinkedQtyMode, QtyMode, roomSqft } from "@/lib/utils";

/** Normalize legacy "ft²" unit label to "sqft" for toggle UI. */
function normalizeUnit(label: string): "sqft" | "lf" | "other" {
  if (label === "sqft" || label === "ft²") return "sqft";
  if (label === "lf") return "lf";
  return "other";
}

interface Props {
  li: LineItemCalc;
  effectiveQty: number | null;
  subtotal: number | null;
  rooms: RoomItem[];
  templates: LineItemTemplate[];
  readOnly: boolean;
  onUpdate: (patch: Partial<LineItemCalc>) => void;
  onRemove: () => void;
  onCommitSubtotal: (next: number | null) => void;
  onSaveBlur: () => void; // save({ lineItems: items })
  onOpenPicker: (rect: DOMRect) => void;
  onApplyTemplate: (templateId: number) => void;
}

export function LineItemRow({
  li,
  effectiveQty,
  subtotal: sub,
  rooms,
  templates,
  readOnly,
  onUpdate,
  onRemove,
  onCommitSubtotal,
  onSaveBlur,
  onOpenPicker,
  onApplyTemplate,
}: Props) {
  const linked = isLinkedQtyMode(li.qtyMode) && li.linkedRoomIds.length > 0;
  const linkedUnit = li.qtyMode === QtyMode.LinkedPerimeter ? "lf" : "sqft";
  const linkedRooms = rooms.filter((r) => li.linkedRoomIds.includes(r.id));
  const unitKind = normalizeUnit(li.unitLabel);
  const canEditSubtotal =
    !readOnly && effectiveQty !== null && effectiveQty > 0;

  return (
    <div
      className={cn(
        "border-b border-[var(--line)] last:border-b-0 transition-[background] duration-[120ms] hover:bg-[var(--surface-2)]",
        linked && "border-l-[3px] border-l-[var(--sage)]"
      )}
    >
      {/* Main row */}
      <div className="grid grid-cols-1 md:grid-cols-[2fr_1.1fr_1fr_1fr_1fr_40px] items-start">
        <div className="px-3.5 py-[11px] space-y-1.5">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={li.name}
              onChange={(e) => onUpdate({ name: e.target.value })}
              onBlur={onSaveBlur}
              disabled={readOnly}
              className="text-[14px] font-[500] flex-1 min-w-0 border-none bg-transparent p-0 focus:outline-none focus:bg-[var(--surface-2)] disabled:cursor-default"
            />
            {!readOnly && templates.length > 0 && (
              <select
                aria-label="Apply template"
                value=""
                onChange={(e) => {
                  const val = e.target.value;
                  if (val) onApplyTemplate(Number(val));
                  e.target.value = "";
                }}
                className="font-[var(--font-mono)] text-[10px] px-1.5 py-1 border border-[var(--line)] rounded-[4px] bg-[var(--surface)] text-[var(--muted)] hover:border-[var(--ink-2)] hover:text-[var(--ink)] cursor-pointer"
              >
                <option value="">Use template…</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <textarea
            value={li.description ?? ""}
            onChange={(e) =>
              onUpdate({
                description: e.target.value || null,
              })
            }
            onBlur={onSaveBlur}
            disabled={readOnly}
            placeholder={readOnly ? "" : "Description (optional)"}
            rows={1}
            className="text-[12px] text-[var(--muted)] w-full border-none bg-transparent p-0 resize-y focus:outline-none focus:bg-[var(--surface-2)] disabled:cursor-default placeholder:text-[var(--muted)] placeholder:opacity-60"
          />
        </div>
        <div className="px-3 py-2">
          <button
            type="button"
            onClick={(e) =>
              !readOnly && onOpenPicker(e.currentTarget.getBoundingClientRect())
            }
            disabled={readOnly}
            className={cn(
              "font-[var(--font-mono)] text-[10px] px-2.5 py-1 border rounded-[4px] transition-colors duration-150 inline-flex items-center gap-[5px]",
              readOnly ? "cursor-default opacity-70" : "cursor-pointer",
              linked
                ? "border-[var(--sage)] text-[var(--sage)] bg-[rgba(61,107,74,0.08)]"
                : "border-[var(--line)] text-[var(--muted)] hover:border-[var(--ink-2)] hover:text-[var(--ink)]"
            )}
          >
            {linked
              ? `🔗 ${linkedRooms.length} room${linkedRooms.length === 1 ? "" : "s"} · ${linkedUnit}`
              : li.qtyMode === QtyMode.Manual
                ? `Manual · ${li.unitLabel || ""}`
                : "Set scope…"}
          </button>
        </div>
        <div className="px-3.5 py-[11px]">
          {linked ? (
            <div className="flex items-baseline gap-[5px]">
              <span className="text-[14px] font-[600] text-[var(--sage)]">
                {effectiveQty !== null ? effectiveQty.toFixed(1) : "—"}
              </span>
              <span className="font-[var(--font-mono)] text-[10px] text-[var(--sage)] opacity-80">
                {linkedUnit}
              </span>
            </div>
          ) : (
            <div className="flex items-baseline gap-2">
              <DecimalInput
                value={li.qty}
                onCommit={(next) => onUpdate({ qty: next })}
                allowEmpty
                disabled={readOnly}
                className="w-[64px] text-[14px] font-[500] border-none bg-transparent p-0 focus:outline-none disabled:cursor-default"
              />
              {unitKind === "other" ? (
                <span className="font-[var(--font-mono)] text-[10px] text-[var(--muted)]">
                  {li.unitLabel}
                </span>
              ) : (
                <select
                  value={unitKind}
                  onChange={(e) => onUpdate({ unitLabel: e.target.value })}
                  disabled={readOnly}
                  className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] bg-transparent border-none focus:outline-none disabled:cursor-default cursor-pointer hover:text-[var(--ink)]"
                >
                  <option value="sqft">sqft</option>
                  <option value="lf">lf</option>
                </select>
              )}
            </div>
          )}
        </div>
        <div className="px-3.5 py-[11px] relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-[var(--font-mono)] text-[11px] text-[var(--muted)] pointer-events-none">
            $
          </span>
          <DecimalInput
            value={li.rate}
            onCommit={(next) => onUpdate({ rate: next ?? 0 })}
            formatOnBlur
            disabled={readOnly}
            className="w-full text-[14px] font-[500] pl-3 border-none bg-transparent p-0 focus:outline-none disabled:cursor-default"
          />
        </div>
        <div className="px-3.5 py-[11px] relative">
          {canEditSubtotal ? (
            <>
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-[var(--font-mono)] text-[11px] text-[var(--muted)] pointer-events-none">
                $
              </span>
              <DecimalInput
                value={sub ?? 0}
                onCommit={(next) => onCommitSubtotal(next)}
                formatOnBlur
                title="Edit subtotal — rate will be recalculated from quantity"
                className={cn(
                  "w-full text-[14px] font-[600] tracking-[-0.01em] pl-3 border-none bg-transparent p-0 focus:outline-none",
                  sub && sub > 0 ? "text-[var(--accent)]" : ""
                )}
              />
            </>
          ) : (
            <span
              className={cn(
                "text-[14px] font-[600] tracking-[-0.01em]",
                sub && sub > 0 ? "text-[var(--accent)]" : ""
              )}
            >
              ${(sub ?? 0).toFixed(2)}
            </span>
          )}
        </div>
        {!readOnly && (
          <button
            type="button"
            onClick={onRemove}
            className="px-[11px] py-[11px] bg-transparent border-none text-[var(--muted)] cursor-pointer text-[14px] leading-none hover:text-[var(--accent)]"
          >
            ✕
          </button>
        )}
        {readOnly && <div />}
      </div>

      {/* Room tags */}
      {linked && linkedRooms.length > 0 && (
        <div className="px-3.5 py-[7px] bg-[var(--surface-2)] border-t border-[var(--line)] flex gap-1.5 flex-wrap items-center">
          {linkedRooms.map((r) => (
            <span
              key={r.id}
              className="font-[var(--font-mono)] text-[10px] px-2 py-0.5 border border-[var(--sage)] text-[var(--sage)] bg-[rgba(61,107,74,0.06)] rounded-[4px] inline-flex items-center gap-[5px]"
            >
              {r.name}{" "}
              <span className="opacity-70">({Math.round(roomSqft(r))})</span>
            </span>
          ))}
          {li.wastePct > 0 && (
            <span className="font-[var(--font-mono)] text-[10px] text-[var(--gold)] px-2 py-0.5 border border-[var(--gold)] bg-[rgba(176,122,26,0.06)] rounded-[4px] ml-1">
              +{li.wastePct}% waste
            </span>
          )}
        </div>
      )}
    </div>
  );
}

"use client";

import type { ReactNode } from "react";
import { buttonClasses } from "@/components/ui/Button";
import { DecimalInput } from "@/components/ui/DecimalInput";
import { CaretDownIcon, WarningIcon, XIcon } from "@/components/ui/icons";
import { Tag } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/cn";
import type { LineItemTemplate } from "@/lib/hooks/useLineItemTemplates";
import type { LineItemCalc, RoomItem } from "@/lib/utils";
import { fmtDollar, isLinkedQtyMode, QtyMode, roomSqft } from "@/lib/utils";

/**
 * Column template shared by the line-item header, rows and totals. The grid
 * only kicks in at xl; below that each line item stacks its controls.
 */
export const LINE_GRID =
  "xl:grid-cols-[minmax(0,1fr)_150px_172px_128px_128px_44px]";

/** Dense field: the builder's grid runs on 34px controls. */
const DENSE_FIELD = "field min-h-[34px] h-[34px] px-2.5";

/** Locked estimates read as plain text rather than disabled boxes. */
const READ_ONLY_FIELD =
  "disabled:bg-transparent disabled:border-transparent disabled:text-[var(--ink)] disabled:cursor-default";

/** Normalize legacy "ft²" unit label to "sqft" for toggle UI. */
function normalizeUnit(label: string): "sqft" | "lf" | "other" {
  if (label === "sqft" || label === "ft²") return "sqft";
  if (label === "lf") return "lf";
  return "other";
}

/** One grid cell; below xl it carries its own label above the control. */
function Cell({
  label,
  align = "left",
  children,
}: {
  label: string;
  align?: "left" | "right";
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "min-w-0 xl:px-2.5 xl:py-2.5",
        align === "right" && "xl:text-right"
      )}
    >
      <div className="type-label mb-1.5 xl:hidden">{label}</div>
      {children}
    </div>
  );
}

interface Props {
  li: LineItemCalc;
  effectiveQty: number | null;
  subtotal: number | null;
  rooms: RoomItem[];
  templates: LineItemTemplate[];
  readOnly: boolean;
  /** Committed structured-field edits (qty, rate, unitLabel) — persist now. */
  onUpdate: (patch: Partial<LineItemCalc>) => void;
  /** In-progress text edits (name, description) — local until blur. */
  onEditText: (patch: Partial<LineItemCalc>) => void;
  onRemove: () => void;
  onCommitSubtotal: (next: number | null) => void;
  onSaveBlur: () => void; // flush pending text edits
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
  onEditText,
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
  // A null subtotal means the quantity can't be resolved (manual line with no
  // qty, or a room-linked line whose rooms were deleted) — it won't be billed.
  const unresolved = sub === null;

  return (
    <div
      className={cn(
        "relative border-b border-[var(--line)] last:border-b-0",
        unresolved
          ? "shadow-[inset_3px_0_0_var(--warn)] bg-[color-mix(in_oklab,var(--warn)_6%,transparent)]"
          : linked && "shadow-[inset_3px_0_0_var(--ok)]"
      )}
    >
      {/* Main row: a grid at xl, stacked label/control pairs below it */}
      <div
        className={cn(
          "grid grid-cols-2 gap-x-3 gap-y-3 px-4 py-3.5 items-start",
          "xl:gap-0 xl:px-1.5 xl:py-0",
          LINE_GRID
        )}
      >
        <div
          className={cn(
            "col-span-2 xl:col-span-1 min-w-0 space-y-1.5 xl:px-2.5 xl:py-2.5",
            !readOnly && "pr-10 xl:pr-2.5"
          )}
        >
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={li.name}
              onChange={(e) => onEditText({ name: e.target.value })}
              onBlur={onSaveBlur}
              disabled={readOnly}
              className={cn(
                DENSE_FIELD,
                READ_ONLY_FIELD,
                "flex-[2] min-w-[160px] w-auto font-[560] disabled:px-0"
              )}
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
                className={cn(
                  DENSE_FIELD,
                  "flex-1 min-w-[130px] w-auto pr-8 bg-[position:right_9px_center] text-[var(--ink-2)]"
                )}
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
          {(!readOnly || li.description) && (
            <textarea
              value={li.description ?? ""}
              onChange={(e) =>
                onEditText({
                  description: e.target.value || null,
                })
              }
              onBlur={onSaveBlur}
              disabled={readOnly}
              placeholder={readOnly ? "" : "Description (optional)"}
              rows={1}
              className={cn(
                "field min-h-[34px] px-2.5 py-[6px] md:text-[13.5px] text-[var(--ink-2)]",
                READ_ONLY_FIELD,
                "disabled:px-0 disabled:text-[var(--ink-2)]"
              )}
            />
          )}
        </div>

        <Cell label="Scope">
          <button
            type="button"
            onClick={(e) =>
              !readOnly && onOpenPicker(e.currentTarget.getBoundingClientRect())
            }
            disabled={readOnly}
            className={cn(
              "inline-flex items-center gap-1.5 max-w-full h-[34px] px-2.5 rounded-[var(--r)] border text-[13.5px] font-[560] whitespace-nowrap transition-colors duration-150",
              readOnly ? "cursor-default" : "cursor-pointer",
              linked
                ? "border-[color-mix(in_oklab,var(--ok)_40%,transparent)] text-[var(--ok)] bg-[color-mix(in_oklab,var(--ok)_10%,transparent)]"
                : readOnly
                  ? "border-transparent px-0 text-[var(--ink-2)]"
                  : "border-[var(--field-border)] text-[var(--ink-2)] hover:border-[var(--ink)] hover:text-[var(--ink)] hover:bg-[var(--hover)]"
            )}
          >
            <span className="truncate">
              {linked
                ? `🔗 ${linkedRooms.length} room${linkedRooms.length === 1 ? "" : "s"} · ${linkedUnit}`
                : li.qtyMode === QtyMode.Manual
                  ? `Manual · ${li.unitLabel || ""}`
                  : "Set scope…"}
            </span>
            {!readOnly && (
              <CaretDownIcon
                aria-hidden="true"
                className="size-[13px] shrink-0 opacity-70"
              />
            )}
          </button>
        </Cell>

        <Cell label="Quantity">
          {linked ? (
            <div className="flex items-baseline gap-1.5 h-[34px] pt-[7px]">
              <span
                className={cn(
                  "type-figure text-[14.5px] font-[600]",
                  unresolved ? "text-[var(--warn)]" : "text-[var(--ok)]"
                )}
              >
                {effectiveQty !== null ? effectiveQty.toFixed(1) : "-"}
              </span>
              <span
                className={cn(
                  "text-[13px]",
                  unresolved ? "text-[var(--warn)]" : "text-[var(--ok)]"
                )}
              >
                {linkedUnit}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <DecimalInput
                value={li.qty}
                onCommit={(next) => onUpdate({ qty: next })}
                allowEmpty
                disabled={readOnly}
                className={cn(
                  DENSE_FIELD,
                  READ_ONLY_FIELD,
                  "type-figure text-right flex-1 min-w-0 xl:flex-none xl:w-[78px]"
                )}
              />
              {unitKind === "other" ? (
                <span className="text-[13px] text-[var(--muted)]">
                  {li.unitLabel}
                </span>
              ) : (
                <select
                  value={unitKind}
                  onChange={(e) => onUpdate({ unitLabel: e.target.value })}
                  disabled={readOnly}
                  aria-label="Unit"
                  className={cn(
                    DENSE_FIELD,
                    READ_ONLY_FIELD,
                    "w-[74px] shrink-0 pl-2.5 pr-7 bg-[position:right_8px_center] disabled:bg-none"
                  )}
                >
                  <option value="sqft">sqft</option>
                  <option value="lf">lf</option>
                </select>
              )}
            </div>
          )}
        </Cell>

        <Cell label="Rate" align="right">
          <div className="relative">
            <span
              aria-hidden="true"
              className="type-figure absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] text-[var(--muted)] pointer-events-none z-[1]"
            >
              $
            </span>
            <DecimalInput
              value={li.rate}
              onCommit={(next) => onUpdate({ rate: next ?? 0 })}
              formatOnBlur
              disabled={readOnly}
              className={cn(
                DENSE_FIELD,
                READ_ONLY_FIELD,
                "type-figure text-right pl-6"
              )}
            />
          </div>
        </Cell>

        <Cell label="Subtotal" align="right">
          {canEditSubtotal ? (
            <div className="relative">
              <span
                aria-hidden="true"
                className="type-figure absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] text-[var(--muted)] pointer-events-none z-[1]"
              >
                $
              </span>
              <DecimalInput
                value={sub ?? 0}
                onCommit={(next) => onCommitSubtotal(next)}
                formatOnBlur
                title="Edit subtotal: rate will be recalculated from quantity"
                className={cn(
                  DENSE_FIELD,
                  "type-figure text-right font-[600] pl-6"
                )}
              />
            </div>
          ) : unresolved ? (
            <div className="flex xl:justify-end h-[34px] items-center">
              <Tag
                tone="pending"
                icon={WarningIcon}
                title="This line has no quantity, so it won't be billed"
              >
                Quantity unset
              </Tag>
            </div>
          ) : (
            <div className="h-[34px] flex items-center xl:justify-end xl:pr-2.5">
              <span className="type-figure text-[14.5px] font-[600]">
                {fmtDollar(sub ?? 0)}
              </span>
            </div>
          )}
        </Cell>

        {!readOnly ? (
          <div className="absolute top-3.5 right-3 xl:static xl:flex xl:justify-center xl:py-2.5">
            <button
              type="button"
              onClick={onRemove}
              aria-label="Remove line item"
              className={buttonClasses({
                variant: "ghost",
                size: "icon-sm",
                className:
                  "text-[var(--ink-2)] hover:text-[var(--accent-ink)] hover:bg-[var(--accent-wash)]",
              })}
            >
              <XIcon aria-hidden="true" weight="bold" />
            </button>
          </div>
        ) : (
          <div className="hidden xl:block" />
        )}
      </div>

      {/* Linked rooms */}
      {linked && linkedRooms.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-4 pb-3.5 xl:px-4 xl:pb-3 -mt-1 xl:mt-0">
          {linkedRooms.map((r) => (
            <Tag key={r.id} tone="ok">
              {r.name}{" "}
              <span className="type-figure opacity-75">
                ({Math.round(roomSqft(r))})
              </span>
            </Tag>
          ))}
          {li.wastePct > 0 && <Tag tone="pending">+{li.wastePct}% waste</Tag>}
        </div>
      )}
    </div>
  );
}

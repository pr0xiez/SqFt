"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { EstimateTotals } from "@/components/estimates/EstimateTotals";
import { LINE_GRID, LineItemRow } from "@/components/estimates/LineItemRow";
import { RoomLinkPicker } from "@/components/estimates/RoomLinkPicker";
import { buttonClasses } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ListChecksIcon } from "@/components/ui/icons";
import { TABLE_HEAD_CELL } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import {
  type EstimateDraft,
  type EstimateDraftAction,
  type EstimateSavePatch,
  reduceEstimateDraft,
} from "@/lib/estimateDraft";
import { computeEstimateView } from "@/lib/estimateView";
import type { LineItemTemplate } from "@/lib/hooks/useLineItemTemplates";
import type { RoomItem } from "@/lib/utils";
import { QtyMode, roomSqft } from "@/lib/utils";

export type { EstimateSavePatch };

interface Props {
  lineItems: EstimateDraft["lineItems"];
  rooms: RoomItem[];
  markupPct: number;
  depositPct: number;
  readOnly?: boolean;
  templates?: LineItemTemplate[];
  onSave: (patch: EstimateSavePatch) => Promise<void>;
}

let _liNextId = Date.now() + 100000;
function tempLiId() {
  return ++_liNextId;
}

export function LineItemSection({
  lineItems: initialLineItems,
  rooms,
  markupPct: initialMarkup,
  depositPct: initialDeposit,
  readOnly = false,
  templates = [],
  onSave,
}: Props) {
  // Seed the Estimate Draft once at mount (storage form, ≡ Prisma columns).
  // Intentionally not resynced from server refetch — see CONTEXT.md.
  const [draft, setDraft] = useState<EstimateDraft>(() => ({
    lineItems: initialLineItems,
    markupPct: initialMarkup,
    depositPct: initialDeposit,
  }));
  const [picker, setPicker] = useState<{
    lineId: number;
    rect: DOMRect;
  } | null>(null);

  // Mirror the latest draft in a ref so dispatch can run the transition once,
  // outside render, without a stale closure or a side effect in the updater.
  const draftRef = useRef(draft);
  draftRef.current = draft;

  // Run one pure transition: apply the next draft and forward any save patch.
  // The save policy lives in the reducer; this adapter only routes the result.
  const dispatch = useCallback(
    (action: EstimateDraftAction) => {
      if (readOnly) return;
      const { draft: next, save } = reduceEstimateDraft(
        draftRef.current,
        action
      );
      draftRef.current = next;
      setDraft(next);
      if (save) onSave(save);
    },
    [readOnly, onSave]
  );

  const view = useMemo(
    () =>
      computeEstimateView({
        lineItems: draft.lineItems,
        items: rooms,
        markupPct: draft.markupPct,
        depositPct: draft.depositPct,
      }),
    [draft, rooms]
  );
  const lineById = useMemo(
    () => new Map(view.lines.map((l) => [l.id, l])),
    [view.lines]
  );

  const { subtotal, markup: markupAmt, total, deposit } = view;

  // EstimateTotals speaks display percentages; the Draft holds storage form.
  const depositDisplayPct = Math.round(draft.depositPct * 1000) / 10;

  return (
    <div className="space-y-3">
      {/* Room summary */}
      {rooms.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px] text-[var(--muted)]">
          <span className="font-[560] text-[var(--ink-2)]">
            Available rooms
          </span>
          {rooms.map((r) => (
            <span key={r.id}>
              {r.name}{" "}
              <span className="type-figure text-[13px]">
                {Math.round(roomSqft(r))}
              </span>{" "}
              sqft
            </span>
          ))}
        </div>
      )}

      {/* Line items table */}
      <div className="card overflow-hidden">
        {/* Header (xl only; rows label their own fields below that) */}
        <div
          className={cn(
            "hidden xl:grid px-1.5 border-b border-[var(--line)]",
            LINE_GRID
          )}
        >
          {(
            [
              ["Description", "left"],
              ["Scope", "left"],
              ["Quantity", "left"],
              ["Rate", "right"],
              ["Subtotal", "right"],
              ["", "left"],
            ] as const
          ).map(([h, align]) => (
            <div
              key={h}
              className={cn(
                TABLE_HEAD_CELL,
                "px-2.5",
                align === "right" && "text-right"
              )}
            >
              {h}
            </div>
          ))}
        </div>

        {/* Rows */}
        {draft.lineItems.length === 0 ? (
          <EmptyState
            icon={ListChecksIcon}
            title="No line items yet."
            body="Add one to begin pricing."
            className="py-10"
          />
        ) : (
          draft.lineItems.map((li) => {
            const lineView = lineById.get(li.id);
            return (
              <LineItemRow
                key={li.id}
                li={li}
                effectiveQty={lineView?.effectiveQty ?? null}
                subtotal={lineView?.subtotal ?? null}
                rooms={rooms}
                templates={templates}
                readOnly={readOnly}
                onUpdate={(patch) =>
                  dispatch({ type: "updateLineItem", id: li.id, patch })
                }
                onEditText={(patch) =>
                  dispatch({ type: "editLineItemText", id: li.id, patch })
                }
                onRemove={() => dispatch({ type: "removeLineItem", id: li.id })}
                onCommitSubtotal={(next) =>
                  dispatch({
                    type: "commitSubtotal",
                    id: li.id,
                    effectiveQty: lineById.get(li.id)?.effectiveQty ?? null,
                    nextSubtotal: next,
                  })
                }
                onSaveBlur={() => dispatch({ type: "flush" })}
                onOpenPicker={(rect) => setPicker({ lineId: li.id, rect })}
                onApplyTemplate={(templateId) => {
                  const tpl = templates.find((t) => t.id === templateId);
                  if (tpl)
                    dispatch({
                      type: "applyTemplate",
                      id: li.id,
                      template: tpl,
                    });
                }}
              />
            );
          })
        )}

        {/* Calc section */}
        {draft.lineItems.length > 0 && (
          <EstimateTotals
            subtotal={subtotal}
            markupPct={draft.markupPct}
            depositPct={depositDisplayPct}
            markupAmt={markupAmt}
            total={total}
            deposit={deposit}
            readOnly={readOnly}
            onCommitMarkup={(next) =>
              dispatch({ type: "setMarkupPct", value: next })
            }
            onCommitDeposit={(next) =>
              dispatch({ type: "setDepositPct", value: next / 100 })
            }
          />
        )}
      </div>

      {/* Add line item button */}
      {!readOnly && (
        <button
          type="button"
          onClick={() => dispatch({ type: "addLineItem", id: tempLiId() })}
          className={buttonClasses({
            variant: "default",
            className: "w-full border-dashed",
          })}
        >
          + Add Line Item
        </button>
      )}

      {picker &&
        (() => {
          const li = draft.lineItems.find((i) => i.id === picker.lineId);
          if (!li) return null;
          return (
            <RoomLinkPicker
              rooms={rooms}
              initialRoomIds={li.linkedRoomIds}
              initialWastePct={li.wastePct}
              anchorRect={picker.rect}
              onApply={(linkedRoomIds, wastePct, measure) =>
                dispatch({
                  type: "updateLineItem",
                  id: picker.lineId,
                  patch: {
                    qtyMode:
                      measure === "perimeter"
                        ? QtyMode.LinkedPerimeter
                        : QtyMode.LinkedArea,
                    linkedRoomIds,
                    wastePct,
                  },
                })
              }
              onClear={() =>
                dispatch({
                  type: "updateLineItem",
                  id: picker.lineId,
                  patch: {
                    qtyMode: QtyMode.Manual,
                    linkedRoomIds: [],
                    wastePct: 0,
                    qty: null,
                  },
                })
              }
              onClose={() => setPicker(null)}
            />
          );
        })()}
    </div>
  );
}

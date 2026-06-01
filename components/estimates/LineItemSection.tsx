"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { EstimateTotals } from "@/components/estimates/EstimateTotals";
import { LineItemRow } from "@/components/estimates/LineItemRow";
import { RoomLinkPicker } from "@/components/estimates/RoomLinkPicker";
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
  convenienceFeeRate: number;
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
  convenienceFeeRate: initialFee,
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
    convenienceFeeRate: initialFee,
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
        convenienceFeeRate: draft.convenienceFeeRate,
        depositPct: draft.depositPct,
      }),
    [draft, rooms]
  );
  const lineById = useMemo(
    () => new Map(view.lines.map((l) => [l.id, l])),
    [view.lines]
  );

  const {
    subtotal,
    markup: markupAmt,
    convenienceFee: feeAmt,
    total,
    deposit,
  } = view;
  const margin = total > 0 ? ((total - subtotal) / total) * 100 : 0;

  // EstimateTotals speaks display percentages; the Draft holds storage form.
  const feePct = Math.round(draft.convenienceFeeRate * 1000) / 10;
  const depositDisplayPct = Math.round(draft.depositPct * 1000) / 10;

  return (
    <div className="space-y-3.5">
      {/* Room summary */}
      {rooms.length > 0 && (
        <div className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] tracking-[.04em] mb-2.5">
          AVAILABLE ROOMS ·{" "}
          {rooms
            .map((r) => `${r.name} (${Math.round(roomSqft(r))} sqft)`)
            .join(" · ")}
        </div>
      )}

      {/* Line items table */}
      <div className="bg-[var(--surface)] border border-[var(--line)] rounded-lg overflow-hidden">
        {/* Header */}
        <div className="hidden md:grid grid-cols-[2fr_1.1fr_1fr_1fr_1fr_40px] bg-[var(--surface-2)] border-b border-[var(--line)]">
          {["Description", "Scope", "Quantity", "Rate", "Subtotal", ""].map(
            (h) => (
              <div
                key={h}
                className="px-3.5 py-2.5 font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.06em]"
              >
                {h}
              </div>
            )
          )}
        </div>

        {/* Rows */}
        {draft.lineItems.length === 0 ? (
          <div className="p-6 text-center font-[var(--font-mono)] text-[12px] text-[var(--muted)]">
            No line items yet — add one to begin pricing.
          </div>
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
            feePct={feePct}
            markupPct={draft.markupPct}
            depositPct={depositDisplayPct}
            feeAmt={feeAmt}
            markupAmt={markupAmt}
            total={total}
            deposit={deposit}
            margin={margin}
            readOnly={readOnly}
            onCommitFee={(next) =>
              dispatch({ type: "setConvenienceFeeRate", value: next / 100 })
            }
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
          className="w-full py-[11px] font-[var(--font-mono)] text-[11px] text-[var(--muted)] bg-transparent border border-dashed border-[var(--line-2)] rounded-[6px] cursor-pointer transition-colors duration-150 hover:border-[var(--ink-2)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)]"
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

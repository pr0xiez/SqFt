import type { LineItemTemplate } from "@/lib/hooks/useLineItemTemplates";
import type { LineItemCalc } from "@/lib/utils";

/** The editable working copy of an estimate's inputs — see CONTEXT.md
 *  "Estimate Draft". Held in storage form: `depositPct` is a decimal (0.5),
 *  `markupPct` is a percentage (20), identical to the Prisma columns and to
 *  `EstimateInput`. A Draft can be fed straight to `computeEstimateView` and
 *  straight into a save patch with no unit conversion. */
export interface EstimateDraft {
  lineItems: LineItemCalc[];
  markupPct: number;
  depositPct: number;
}

/** Partial set of fields to persist. A reducer transition returns one of these
 *  (or `null` when nothing should be saved). Mirrors the repo's `EstimatePatch`
 *  shape so the adapter can hand it straight to `onSave`. */
export interface EstimateSavePatch {
  lineItems?: LineItemCalc[];
  markupPct?: number;
  depositPct?: number;
}

export type EstimateDraftAction =
  /** Append a new line item. The adapter supplies the temp `id` so the reducer
   *  stays pure (no Date.now / counter inside the module). */
  | { type: "addLineItem"; id: number }
  /** Apply a committed structured-field patch (qty, rate, unitLabel, scope).
   *  Persists immediately. */
  | { type: "updateLineItem"; id: number; patch: Partial<LineItemCalc> }
  /** Apply an in-progress text edit (name / description). Local only — no save
   *  until a `flush`. */
  | { type: "editLineItemText"; id: number; patch: Partial<LineItemCalc> }
  /** Remove a line item by id. */
  | { type: "removeLineItem"; id: number }
  /** Copy a template's name/description/rate/unitLabel onto a line item — never
   *  its qty, scope, or waste%. */
  | { type: "applyTemplate"; id: number; template: LineItemTemplate }
  /** Back-calculate `rate = nextSubtotal / effectiveQty` for a line. The action
   *  carries `effectiveQty` because it derives from the Estimate View, not the
   *  Draft. No-op when qty is 0/absent or the subtotal is null/negative. */
  | {
      type: "commitSubtotal";
      id: number;
      effectiveQty: number | null;
      nextSubtotal: number | null;
    }
  /** Set the markup percentage (e.g. 20). */
  | { type: "setMarkupPct"; value: number }
  /** Set the deposit rate (decimal, e.g. 0.5). */
  | { type: "setDepositPct"; value: number }
  /** Persist pending local text edits (on blur). */
  | { type: "flush" };

export interface EstimateDraftResult {
  draft: EstimateDraft;
  /** Patch to persist for this transition, or `null` to save nothing. */
  save: EstimateSavePatch | null;
}

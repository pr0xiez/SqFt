import { QtyMode } from "@/lib/utils";
import type {
  EstimateDraft,
  EstimateDraftAction,
  EstimateDraftResult,
} from "./types";

/** Pure reducer for the Estimate Draft (see CONTEXT.md). Each transition
 *  returns the next draft plus the save patch to persist, or `null` to save
 *  nothing. */
export function reduceEstimateDraft(
  draft: EstimateDraft,
  action: EstimateDraftAction
): EstimateDraftResult {
  switch (action.type) {
    case "addLineItem": {
      const lineItems = [
        ...draft.lineItems,
        {
          id: action.id,
          name: "New line item",
          description: null,
          rate: 0,
          qtyMode: QtyMode.Manual,
          qty: 0,
          wastePct: 0,
          unitLabel: "sqft",
          linkedRoomIds: [],
          sortOrder: draft.lineItems.length,
        },
      ];
      const next = { ...draft, lineItems };
      return { draft: next, save: { lineItems } };
    }
    case "updateLineItem": {
      const lineItems = patchLine(draft.lineItems, action.id, action.patch);
      return { draft: { ...draft, lineItems }, save: { lineItems } };
    }
    case "editLineItemText": {
      const lineItems = patchLine(draft.lineItems, action.id, action.patch);
      return { draft: { ...draft, lineItems }, save: null };
    }
    case "applyTemplate": {
      const { name, description, rate, unitLabel } = action.template;
      const lineItems = patchLine(draft.lineItems, action.id, {
        name,
        description: description ?? null,
        rate,
        unitLabel,
      });
      return { draft: { ...draft, lineItems }, save: { lineItems } };
    }
    case "commitSubtotal": {
      const { effectiveQty, nextSubtotal } = action;
      if (
        effectiveQty === null ||
        effectiveQty === 0 ||
        nextSubtotal === null ||
        nextSubtotal < 0
      ) {
        return { draft, save: null };
      }
      const lineItems = patchLine(draft.lineItems, action.id, {
        rate: nextSubtotal / effectiveQty,
      });
      return { draft: { ...draft, lineItems }, save: { lineItems } };
    }
    case "removeLineItem": {
      const lineItems = draft.lineItems.filter((i) => i.id !== action.id);
      return { draft: { ...draft, lineItems }, save: { lineItems } };
    }
    case "setConvenienceFeeRate":
      return {
        draft: { ...draft, convenienceFeeRate: action.value },
        save: { convenienceFeeRate: action.value },
      };
    case "setMarkupPct":
      return {
        draft: { ...draft, markupPct: action.value },
        save: { markupPct: action.value },
      };
    case "setDepositPct":
      return {
        draft: { ...draft, depositPct: action.value },
        save: { depositPct: action.value },
      };
    case "flush":
      return { draft, save: { lineItems: draft.lineItems } };
  }
}

/** Apply a partial patch to the line item with `id`, returning a new array.
 *  Lines that don't match are returned untouched. */
function patchLine(
  lineItems: EstimateDraft["lineItems"],
  id: number,
  patch: Partial<EstimateDraft["lineItems"][number]>
): EstimateDraft["lineItems"] {
  return lineItems.map((item) =>
    item.id === id ? { ...item, ...patch } : item
  );
}

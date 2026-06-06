// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LineItemRow } from "@/components/estimates/LineItemRow";
import type { LineItemCalc, RoomItem } from "@/lib/utils";
import { QtyMode } from "@/lib/utils";

const li = (over: Partial<LineItemCalc> = {}): LineItemCalc => ({
  id: 1,
  name: "Stair nosing",
  description: null,
  rate: 12,
  qtyMode: QtyMode.Manual,
  qty: null,
  wastePct: 0,
  unitLabel: "lf",
  linkedRoomIds: [],
  sortOrder: 0,
  ...over,
});

function renderRow(
  props: {
    li?: LineItemCalc;
    effectiveQty?: number | null;
    subtotal?: number | null;
    rooms?: RoomItem[];
    readOnly?: boolean;
  } = {}
) {
  return render(
    <LineItemRow
      li={props.li ?? li()}
      effectiveQty={props.effectiveQty ?? null}
      subtotal={props.subtotal ?? null}
      rooms={props.rooms ?? []}
      templates={[]}
      readOnly={props.readOnly ?? false}
      onUpdate={vi.fn()}
      onEditText={vi.fn()}
      onRemove={vi.fn()}
      onCommitSubtotal={vi.fn()}
      onSaveBlur={vi.fn()}
      onOpenPicker={vi.fn()}
      onApplyTemplate={vi.fn()}
    />
  );
}

describe("LineItemRow — unresolved (Quantity unset) flag", () => {
  it("flags a manual line with no quantity", () => {
    renderRow({ subtotal: null, effectiveQty: null });
    expect(screen.queryByText(/Quantity unset/)).not.toBeNull();
    // The misleading $0.00 must NOT appear for an unresolved line.
    expect(screen.queryByText("$0.00")).toBeNull();
  });

  it("flags a room-linked line whose linked rooms were deleted", () => {
    renderRow({
      li: li({ qtyMode: QtyMode.LinkedArea, linkedRoomIds: [5] }),
      rooms: [], // room 5 no longer exists → unresolved
      subtotal: null,
      effectiveQty: null,
    });
    expect(screen.queryByText(/Quantity unset/)).not.toBeNull();
  });

  it("does NOT flag a deliberate $0 (free) line", () => {
    renderRow({ li: li({ qty: 0 }), effectiveQty: 0, subtotal: 0 });
    expect(screen.queryByText(/Quantity unset/)).toBeNull();
    expect(screen.queryByText("$0.00")).not.toBeNull();
  });

  it("does NOT flag a normally priced line", () => {
    renderRow({ li: li({ qty: 10 }), effectiveQty: 10, subtotal: 120 });
    expect(screen.queryByText(/Quantity unset/)).toBeNull();
  });

  it("still flags an unresolved line when read-only (locked estimate)", () => {
    renderRow({ subtotal: null, effectiveQty: null, readOnly: true });
    expect(screen.queryByText(/Quantity unset/)).not.toBeNull();
  });
});

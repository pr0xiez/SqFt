// @vitest-environment jsdom

import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RoomSection } from "@/components/siteMeasures/RoomSection";
import type { SiteMeasure } from "@/lib/hooks/useSiteMeasures";
import type { RoomItem } from "@/lib/utils";

function siteMeasure(items: RoomItem[] = []): SiteMeasure {
  return {
    id: 1,
    orgId: "org_1",
    locationId: 1,
    date: "2026-06-07T00:00:00.000Z",
    createdAt: "2026-06-07T00:00:00.000Z",
    items,
  };
}

const room = (over: Partial<RoomItem> = {}): RoomItem => ({
  id: 1,
  type: "room",
  name: "Living Room",
  shape: "rect",
  w: 10,
  l: 12,
  note: "",
  ...over,
});

/** Render RoomSection with a fake onSave; returns the spy for assertions. */
function renderSection(items: RoomItem[] = []) {
  const onSave = vi.fn<(items: RoomItem[]) => Promise<void>>(() =>
    Promise.resolve()
  );
  render(<RoomSection siteMeasure={siteMeasure(items)} onSave={onSave} />);
  return { onSave };
}

/** Read the gross-area summary bar value, or null if it isn't rendered. */
function grossArea(): string | null {
  const label = screen.queryByText("Gross area");
  if (!label) return null;
  // The summary value is the sibling div after the "Gross area" label.
  return label.nextElementSibling?.textContent ?? null;
}

describe("RoomSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the empty state and no summary bar when there are no items", () => {
    renderSection([]);
    expect(screen.queryByText(/No rooms yet/)).not.toBeNull();
    expect(grossArea()).toBeNull();
  });

  it("renders an existing room and its derived sqft + gross-area total", () => {
    renderSection([room({ w: 10, l: 12 })]);
    // 10 × 12 = 120 sqft, shown both on the room and in the summary.
    expect(screen.getAllByText("120 sqft").length).toBeGreaterThanOrEqual(2);
    expect(grossArea()).toContain("120 sqft");
  });

  it("sums gross area across multiple rooms", () => {
    renderSection([
      room({ id: 1, w: 10, l: 12 }), // 120
      room({ id: 2, name: "Kitchen", w: 5, l: 8 }), // 40
    ]);
    expect(grossArea()).toContain("160 sqft");
  });

  it("adds a room: it appears, empty state clears, and onSave fires", () => {
    const { onSave } = renderSection([]);
    fireEvent.click(screen.getByText("+ Add Room"));

    expect(screen.queryByText(/No rooms yet/)).toBeNull();
    const nameInput = screen.getByPlaceholderText(
      "Room name"
    ) as HTMLInputElement;
    expect(nameInput.value).toBe("New Room");

    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0];
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ type: "room", name: "New Room" });
  });

  it("edits width/length: derived sqft and gross-area total update", () => {
    renderSection([room({ w: null, l: null })]);
    // The room exists (so the summary bar renders) but has no dimensions yet,
    // so the gross-area total reads "—" rather than a sqft figure.
    expect(grossArea()).toContain("—");

    fireEvent.change(screen.getByPlaceholderText("L"), {
      target: { value: "12" },
    });
    fireEvent.change(screen.getByPlaceholderText("W"), {
      target: { value: "10" },
    });

    // 12 × 10 = 120
    expect(grossArea()).toContain("120 sqft");
  });

  it("edits the room name and persists it via onSave", () => {
    const { onSave } = renderSection([room({ name: "Living Room" })]);
    const nameInput = screen.getByPlaceholderText(
      "Room name"
    ) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Master Bedroom" } });

    expect(nameInput.value).toBe("Master Bedroom");
    const lastCall = onSave.mock.calls.at(-1)?.[0];
    expect(lastCall?.[0]).toMatchObject({ name: "Master Bedroom" });
  });

  it("edits the room note and persists it via onSave", () => {
    const { onSave } = renderSection([room()]);
    const noteInput = screen.getByPlaceholderText(
      "Add note about this room…"
    ) as HTMLInputElement;
    fireEvent.change(noteInput, { target: { value: "Tile floor" } });

    expect(noteInput.value).toBe("Tile floor");
    const lastCall = onSave.mock.calls.at(-1)?.[0];
    expect(lastCall?.[0]).toMatchObject({ note: "Tile floor" });
  });

  it("removes a room: it disappears, the total recomputes, and onSave fires", () => {
    const { onSave } = renderSection([
      room({ id: 1, name: "Living Room", w: 10, l: 12 }), // 120
      room({ id: 2, name: "Kitchen", w: 5, l: 8 }), // 40
    ]);
    expect(grossArea()).toContain("160 sqft");

    // Remove the first room via its Remove button.
    const livingRoom = screen
      .getByDisplayValue("Living Room")
      .closest("div") as HTMLElement;
    fireEvent.click(within(livingRoom).getByText("Remove"));

    expect(screen.queryByDisplayValue("Living Room")).toBeNull();
    expect(screen.queryByDisplayValue("Kitchen")).not.toBeNull();
    // Only Kitchen (40) remains.
    expect(grossArea()).toContain("40 sqft");

    const lastCall = onSave.mock.calls.at(-1)?.[0];
    expect(lastCall).toHaveLength(1);
    expect(lastCall?.[0]).toMatchObject({ name: "Kitchen" });
  });

  it("focuses the name input when a room is added", () => {
    renderSection([]);
    fireEvent.click(screen.getByText("+ Add Room"));
    const nameInput = screen.getByPlaceholderText(
      "Room name"
    ) as HTMLInputElement;
    expect(document.activeElement).toBe(nameInput);
  });

  it("adds a dimension box and sums it into the room total", () => {
    renderSection([room({ id: 1, name: "Great Room", w: 10, l: 12 })]); // 120
    // Add a second box.
    fireEvent.click(screen.getByText("+ dimension"));
    // Now two L inputs and two W inputs; fill the second box 4 × 3 = 12.
    const ls = screen.getAllByPlaceholderText("L");
    const ws = screen.getAllByPlaceholderText("W");
    fireEvent.change(ls[1], { target: { value: "4" } });
    fireEvent.change(ws[1], { target: { value: "3" } });
    // 120 + 12 = 132 gross.
    expect(grossArea()).toContain("132 sqft");
  });

  it("removes a dimension box and recomputes the total", () => {
    renderSection([
      room({
        id: 1,
        name: "Great Room",
        segments: [
          { w: 10, l: 12 },
          { w: 4, l: 3 },
        ],
        w: null,
        l: null,
      }),
    ]);
    expect(grossArea()).toContain("132 sqft");
    // Two boxes → each has a remove control; remove the second.
    const removes = screen.getAllByLabelText("Remove dimension");
    expect(removes).toHaveLength(2);
    fireEvent.click(removes[1]);
    expect(grossArea()).toContain("120 sqft");
  });

  it("does not show a per-box remove control when a room has one box", () => {
    renderSection([room({ id: 1, w: 10, l: 12 })]);
    expect(screen.queryByLabelText("Remove dimension")).toBeNull();
  });
});

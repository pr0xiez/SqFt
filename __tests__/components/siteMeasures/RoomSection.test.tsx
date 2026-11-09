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
    // A new room starts unnamed, on the picker's placeholder.
    const picker = screen.getByLabelText("Room name") as HTMLSelectElement;
    expect(picker.value).toBe("");
    expect(screen.queryByLabelText("Custom room name")).toBeNull();

    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0];
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ type: "room", name: "" });
  });

  it("edits width/length: derived sqft and gross-area total update on commit", () => {
    renderSection([room({ w: null, l: null })]);
    // The room exists (so the summary bar renders) but has no dimensions yet,
    // so the gross-area total reads "-" rather than a sqft figure.
    expect(grossArea()).toBe("-");

    // Dimension fields are DecimalInputs: they hold a draft while typing and
    // commit on blur.
    const l = screen.getByPlaceholderText("L");
    fireEvent.change(l, { target: { value: "12" } });
    fireEvent.blur(l);
    const w = screen.getByPlaceholderText("W");
    fireEvent.change(w, { target: { value: "10" } });
    fireEvent.blur(w);

    // 12 × 10 = 120
    expect(grossArea()).toContain("120 sqft");
  });

  it("accepts a leading zero in a dimension (regression: 0 was swallowed)", () => {
    const { onSave } = renderSection([room({ w: null, l: null })]);
    const l = screen.getByPlaceholderText("L") as HTMLInputElement;
    // Typing "0" then continuing to "0.5" must keep the draft text intact.
    fireEvent.change(l, { target: { value: "0" } });
    expect(l.value).toBe("0");
    fireEvent.change(l, { target: { value: "0.5" } });
    expect(l.value).toBe("0.5");
    fireEvent.blur(l);

    const lastRoom = onSave.mock.calls.at(-1)?.[0]?.[0];
    expect(lastRoom?.segments?.[0]?.l).toBe(0.5);
  });

  it("picks a common room name from the dropdown and persists it", () => {
    const { onSave } = renderSection([room({ name: "Living Room" })]);
    const picker = screen.getByLabelText("Room name") as HTMLSelectElement;
    expect(picker.value).toBe("Living Room");

    fireEvent.change(picker, { target: { value: "Master Bedroom" } });

    expect(picker.value).toBe("Master Bedroom");
    const lastCall = onSave.mock.calls.at(-1)?.[0];
    expect(lastCall?.[0]).toMatchObject({ name: "Master Bedroom" });
  });

  it("lists Custom as the first option", () => {
    renderSection([room({ name: "Kitchen" })]);
    const picker = screen.getByLabelText("Room name") as HTMLSelectElement;
    expect(picker.options[0].textContent).toBe("Custom…");
  });

  it("choosing Custom reveals a focused text input that edits the name", () => {
    const { onSave } = renderSection([room({ name: "Kitchen" })]);
    const picker = screen.getByLabelText("Room name") as HTMLSelectElement;
    fireEvent.change(picker, { target: { value: "__custom__" } });

    // The current name carries over so it can be tweaked.
    const custom = screen.getByLabelText(
      "Custom room name"
    ) as HTMLInputElement;
    expect(custom.value).toBe("Kitchen");
    expect(document.activeElement).toBe(custom);

    fireEvent.change(custom, { target: { value: "Upstairs Kitchen" } });
    expect(picker.value).toBe("__custom__");
    const lastCall = onSave.mock.calls.at(-1)?.[0];
    expect(lastCall?.[0]).toMatchObject({ name: "Upstairs Kitchen" });
  });

  it("keeps the custom input up while the custom name is empty or a preset", () => {
    renderSection([room({ name: "Kitchen" })]);
    const picker = screen.getByLabelText("Room name") as HTMLSelectElement;
    fireEvent.change(picker, { target: { value: "__custom__" } });
    const custom = screen.getByLabelText("Custom room name");

    fireEvent.change(custom, { target: { value: "" } });
    expect(screen.queryByLabelText("Custom room name")).not.toBeNull();
    fireEvent.change(custom, { target: { value: "Den" } });
    expect(screen.queryByLabelText("Custom room name")).not.toBeNull();
    expect(picker.value).toBe("__custom__");
  });

  it("picking a preset after Custom hides the text input", () => {
    renderSection([room({ name: "Sewing Room" })]);
    const picker = screen.getByLabelText("Room name") as HTMLSelectElement;
    fireEvent.change(picker, { target: { value: "Office" } });
    expect(picker.value).toBe("Office");
    expect(screen.queryByLabelText("Custom room name")).toBeNull();
  });

  it("shows a saved name outside the presets as Custom with its text", () => {
    renderSection([room({ name: "Sewing Room" })]);
    const picker = screen.getByLabelText("Room name") as HTMLSelectElement;
    expect(picker.value).toBe("__custom__");
    const custom = screen.getByLabelText(
      "Custom room name"
    ) as HTMLInputElement;
    expect(custom.value).toBe("Sewing Room");
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

  it("focuses the room-name picker when a room is added", () => {
    renderSection([]);
    fireEvent.click(screen.getByText("+ Add Room"));
    expect(document.activeElement).toBe(screen.getByLabelText("Room name"));
  });

  it("adds a dimension box and sums it into the room total", () => {
    renderSection([room({ id: 1, name: "Great Room", w: 10, l: 12 })]); // 120
    // Add a second box.
    fireEvent.click(screen.getByText("+ dimension"));
    // Now two L inputs and two W inputs; fill the second box 4 × 3 = 12.
    const ls = screen.getAllByPlaceholderText("L");
    const ws = screen.getAllByPlaceholderText("W");
    fireEvent.change(ls[1], { target: { value: "4" } });
    fireEvent.blur(ls[1]);
    fireEvent.change(ws[1], { target: { value: "3" } });
    fireEvent.blur(ws[1]);
    // 120 + 12 = 132 gross.
    expect(grossArea()).toContain("132 sqft");
  });

  it("strips editor-only segment keys from what onSave receives", () => {
    const { onSave } = renderSection([room({ id: 1, w: 10, l: 12 })]);
    fireEvent.click(screen.getByText("+ dimension"));

    const saved = onSave.mock.calls.at(-1)?.[0]?.[0];
    expect(saved?.segments).toEqual([
      { w: 10, l: 12 },
      { w: null, l: null },
    ]);
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

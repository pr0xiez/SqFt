// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RoomsList } from "@/components/estimates/public-estimate/RoomsList";
import type { RoomItem } from "@/lib/utils";

const rooms = (items: RoomItem[]) => items;

describe("RoomsList", () => {
  it("shows w×l and sqft for a single-box room", () => {
    render(
      <RoomsList
        rooms={rooms([
          { id: 1, type: "room", name: "Den", shape: "rect", w: 10, l: 12 },
        ])}
      />
    );
    expect(screen.getByText("Den")).not.toBeNull();
    expect(screen.getByText(/12×10 · 120 sqft/)).not.toBeNull();
  });

  it("shows the box count and summed sqft for a multi-box room", () => {
    render(
      <RoomsList
        rooms={rooms([
          {
            id: 1,
            type: "room",
            name: "L Room",
            segments: [
              { w: 10, l: 12 },
              { w: 4, l: 3 },
            ],
          },
        ])}
      />
    );
    // 120 + 12 = 132; two boxes.
    expect(screen.getByText(/2 areas · 132 sqft/)).not.toBeNull();
  });
});

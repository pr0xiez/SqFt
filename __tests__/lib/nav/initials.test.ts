import { describe, expect, it } from "vitest";
import { getInitials } from "@/lib/nav/initials";

describe("getInitials", () => {
  it("uses first + last initial of a full name", () => {
    expect(getInitials("Alex Lead", null)).toBe("AL");
  });

  it("uses a single initial for a one-word name", () => {
    expect(getInitials("Cher", null)).toBe("C");
  });

  it("falls back to the email's first letter when no name", () => {
    expect(getInitials(null, "boss@sqft.dev")).toBe("B");
  });

  it("returns a dot placeholder when nothing is available", () => {
    expect(getInitials(null, null)).toBe("··");
  });
});

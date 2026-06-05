import { describe, expect, it } from "vitest";
import { formatAddress } from "@/lib/locations/formatAddress";

describe("formatAddress", () => {
  it("joins all parts in US single-line order", () => {
    expect(
      formatAddress({
        street: "1247 Elm St",
        unit: "Apt 2",
        city: "Columbus",
        state: "OH",
        postalCode: "43215",
      })
    ).toBe("1247 Elm St, Apt 2, Columbus, OH 43215");
  });

  it("omits empty/whitespace parts and trims", () => {
    expect(
      formatAddress({
        street: " 89 Oak Ave ",
        unit: "",
        city: "Worthington",
        state: "OH",
        postalCode: "",
      })
    ).toBe("89 Oak Ave, Worthington, OH");
  });

  it("returns empty string when everything is blank", () => {
    expect(
      formatAddress({
        street: "",
        unit: "",
        city: "",
        state: "",
        postalCode: "",
      })
    ).toBe("");
  });
});

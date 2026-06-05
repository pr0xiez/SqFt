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

  it("treats a null unit the same as an absent one", () => {
    expect(
      formatAddress({
        street: "12 Oak St",
        unit: null,
        city: "Dublin",
        state: "OH",
        postalCode: "43017",
      })
    ).toBe("12 Oak St, Dublin, OH 43017");
  });

  it("joins state and zip independently when only one is present", () => {
    expect(
      formatAddress({
        street: "5 Pine Ct",
        city: "Bexley",
        state: "OH",
        postalCode: "",
      })
    ).toBe("5 Pine Ct, Bexley, OH");
    expect(
      formatAddress({
        street: "5 Pine Ct",
        city: "Bexley",
        state: "",
        postalCode: "43209",
      })
    ).toBe("5 Pine Ct, Bexley, 43209");
  });
});

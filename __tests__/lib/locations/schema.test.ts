import { describe, expect, it } from "vitest";
import { locationCreateSchema } from "@/lib/locations/schema";

describe("locationCreateSchema", () => {
  const base = {
    customerId: 1,
    street: "1247 Elm St",
    city: "Columbus",
    state: "OH",
    postalCode: "43215",
  };

  it("accepts structured input without an address field", () => {
    const parsed = locationCreateSchema.parse({
      ...base,
      unit: "Apt 2",
      lat: 39.96,
      lon: -83.0,
    });
    expect(parsed.street).toBe("1247 Elm St");
    expect(parsed.lat).toBe(39.96);
  });

  it("requires street, city, state, postalCode", () => {
    expect(locationCreateSchema.safeParse({ customerId: 1 }).success).toBe(
      false
    );
  });

  it("allows omitting unit, label, notes, lat, lon", () => {
    expect(locationCreateSchema.safeParse(base).success).toBe(true);
  });
});

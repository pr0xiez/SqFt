import { describe, expect, it } from "vitest";
import { mapGeoapifyResults } from "@/lib/address/geoapify";

const sample = {
  results: [
    {
      housenumber: "1247",
      street: "Elm Street",
      city: "Columbus",
      state: "Ohio",
      state_code: "OH",
      postcode: "43215",
      lat: 39.961,
      lon: -82.998,
      formatted: "1247 Elm Street, Columbus, OH 43215, United States",
    },
    {
      street: "Oak Avenue",
      city: "Dublin",
      state_code: "OH",
      postcode: "43017",
      lat: 40.099,
      lon: -83.114,
      formatted: "Oak Avenue, Dublin, OH 43017, United States",
    },
  ],
};

describe("mapGeoapifyResults", () => {
  it("normalizes results to structured suggestions", () => {
    const out = mapGeoapifyResults(sample);
    expect(out[0]).toEqual({
      formatted: "1247 Elm Street, Columbus, OH 43215, United States",
      street: "1247 Elm Street",
      unit: "",
      city: "Columbus",
      state: "OH",
      postalCode: "43215",
      lat: 39.961,
      lon: -82.998,
    });
  });

  it("falls back to full state name when no state_code, and street with no housenumber", () => {
    const out = mapGeoapifyResults(sample);
    expect(out[1].street).toBe("Oak Avenue");
    expect(out[1].state).toBe("OH");
  });

  it("returns [] for malformed payloads", () => {
    expect(mapGeoapifyResults({})).toEqual([]);
    expect(mapGeoapifyResults(null)).toEqual([]);
  });
});

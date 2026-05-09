import { describe, expect, it } from "vitest";
import { filterCustomers } from "@/components/customers/filterCustomers";

type C = {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  source: string;
};

const sample: C[] = [
  {
    id: 1,
    name: "Alice Smith",
    phone: "555-1111",
    email: "alice@example.com",
    address: "12 Oak St",
    source: "phone",
  },
  {
    id: 2,
    name: "Bob Jones",
    phone: "555-2222",
    email: "bob@example.com",
    address: "44 Elm Rd",
    source: "online",
  },
  {
    id: 3,
    name: "Carol Lee",
    phone: null,
    email: null,
    address: null,
    source: "referral",
  },
];

describe("filterCustomers", () => {
  it("returns input unchanged when query is empty and source is 'all'", () => {
    expect(filterCustomers(sample, "", "all")).toEqual(sample);
  });

  it("matches by name case-insensitively", () => {
    const result = filterCustomers(sample, "alice", "all");
    expect(result.map((c) => c.id)).toEqual([1]);
  });

  it("matches by phone substring", () => {
    const result = filterCustomers(sample, "2222", "all");
    expect(result.map((c) => c.id)).toEqual([2]);
  });

  it("matches by email substring", () => {
    const result = filterCustomers(sample, "BOB@", "all");
    expect(result.map((c) => c.id)).toEqual([2]);
  });

  it("matches by address substring", () => {
    const result = filterCustomers(sample, "elm", "all");
    expect(result.map((c) => c.id)).toEqual([2]);
  });

  it("ignores null optional fields without throwing", () => {
    const result = filterCustomers(sample, "carol", "all");
    expect(result.map((c) => c.id)).toEqual([3]);
  });

  it("filters by source when query is empty", () => {
    const result = filterCustomers(sample, "", "phone");
    expect(result.map((c) => c.id)).toEqual([1]);
  });

  it("composes query and source (both must match)", () => {
    // "555" is in both Alice and Bob's phones, but only Alice is source 'phone'.
    const result = filterCustomers(sample, "555", "phone");
    expect(result.map((c) => c.id)).toEqual([1]);
  });

  it("trims whitespace from the query before matching", () => {
    const result = filterCustomers(sample, "   smith   ", "all");
    expect(result.map((c) => c.id)).toEqual([1]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(filterCustomers(sample, "zzz-no-match", "all")).toEqual([]);
  });
});

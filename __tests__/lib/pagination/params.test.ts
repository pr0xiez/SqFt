import { describe, expect, it } from "vitest";
import { parsePageParams } from "@/lib/pagination/params";

const opts = {
  validSortKeys: ["date", "name"] as const,
  defaultSort: { key: "date" as const, direction: "desc" as const },
};

function parse(qs: string) {
  return parsePageParams(new URL(`http://x/api/list?${qs}`), opts);
}

describe("parsePageParams", () => {
  it("applies defaults when params are absent", () => {
    expect(parse("")).toEqual({
      page: 1,
      perPage: 25,
      sort: { key: "date", direction: "desc" },
      q: "",
    });
  });

  it("clamps page to >= 1 and floors fractions", () => {
    expect(parse("page=0").page).toBe(1);
    expect(parse("page=-4").page).toBe(1);
    expect(parse("page=3.9").page).toBe(3);
  });

  it("rejects perPage not in the allow-list, falling back to default", () => {
    expect(parse("perPage=999").perPage).toBe(25);
    expect(parse("perPage=50").perPage).toBe(50);
  });

  it("ignores an invalid sort key or direction, keeping the default", () => {
    expect(parse("sort=bogus&dir=asc").sort).toEqual({
      key: "date",
      direction: "desc",
    });
    expect(parse("sort=name&dir=sideways").sort).toEqual({
      key: "date",
      direction: "desc",
    });
  });

  it("accepts a valid sort key + direction", () => {
    expect(parse("sort=name&dir=asc").sort).toEqual({
      key: "name",
      direction: "asc",
    });
  });

  it("trims the search query", () => {
    expect(parse("q=%20%20acme%20").q).toBe("acme");
  });
});

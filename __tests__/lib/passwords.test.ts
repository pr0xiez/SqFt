import { describe, expect, it } from "vitest";
import { suggestPassword } from "@/lib/passwords";

describe("suggestPassword", () => {
  it("returns a 16-char string from the safe alphabet", () => {
    const pw = suggestPassword();
    expect(pw).toHaveLength(16);
    expect(pw).toMatch(/^[a-zA-Z0-9]+$/);
    // no ambiguous chars (l, I, O, 0, 1)
    expect(pw).not.toMatch(/[lIO01]/);
  });

  it("is different across calls", () => {
    expect(suggestPassword()).not.toBe(suggestPassword());
  });
});

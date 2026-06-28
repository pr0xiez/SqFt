import { describe, expect, it } from "vitest";
import { mapCapabilityStatus } from "@/lib/stripe/connect";

describe("mapCapabilityStatus", () => {
  it("maps active to active", () => {
    expect(mapCapabilityStatus("active")).toBe("active");
  });
  it("maps unrequested/pending/inactive to pending", () => {
    expect(mapCapabilityStatus("pending")).toBe("pending");
    expect(mapCapabilityStatus("unrequested")).toBe("pending");
    expect(mapCapabilityStatus(undefined)).toBe("pending");
  });
  it("maps restricted/disabled to restricted", () => {
    expect(mapCapabilityStatus("restricted")).toBe("restricted");
    expect(mapCapabilityStatus("disabled")).toBe("restricted");
  });
});

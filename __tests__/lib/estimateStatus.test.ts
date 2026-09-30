import { describe, expect, it } from "vitest";
import { isEstimateLocked, isOpenEstimate } from "@/lib/estimateStatus";

describe("isEstimateLocked", () => {
  it("is locked when approved", () => {
    expect(isEstimateLocked("approved")).toBe(true);
  });

  it("is locked when declined", () => {
    expect(isEstimateLocked("declined")).toBe(true);
  });

  it("is open (not locked) for draft, sent, and viewed", () => {
    expect(isEstimateLocked("draft")).toBe(false);
    expect(isEstimateLocked("sent")).toBe(false);
    expect(isEstimateLocked("viewed")).toBe(false);
  });
});

describe("isOpenEstimate", () => {
  it("is open for sent and viewed", () => {
    expect(isOpenEstimate({ status: "sent" })).toBe(true);
    expect(isOpenEstimate({ status: "viewed" })).toBe(true);
  });

  it("is not open for draft, approved, or declined", () => {
    expect(isOpenEstimate({ status: "draft" })).toBe(false);
    expect(isOpenEstimate({ status: "approved" })).toBe(false);
    expect(isOpenEstimate({ status: "declined" })).toBe(false);
  });
});

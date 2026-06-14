import { describe, expect, it } from "vitest";
import { isPublicReviewPath } from "@/lib/publicRoutes";

describe("isPublicReviewPath", () => {
  it("allows the public estimate-review page", () => {
    expect(isPublicReviewPath("/estimate-review/some-token-abc123")).toBe(true);
  });

  it("allows the public estimate-review API (approve/decline)", () => {
    expect(
      isPublicReviewPath("/api/estimate-review/some-token-abc123/approve")
    ).toBe(true);
    expect(
      isPublicReviewPath("/api/estimate-review/some-token-abc123/decline")
    ).toBe(true);
  });

  it("allows the public invoice-review page (invoice email links)", () => {
    expect(isPublicReviewPath("/invoice-review/some-token-abc123")).toBe(true);
  });

  it("allows the public pay route and the Stripe webhook", () => {
    expect(
      isPublicReviewPath("/api/invoice-review/some-token-abc123/pay")
    ).toBe(true);
    expect(isPublicReviewPath("/api/stripe/webhook")).toBe(true);
  });

  it("does not allow authed builder pages or APIs", () => {
    expect(isPublicReviewPath("/")).toBe(false);
    expect(isPublicReviewPath("/invoices")).toBe(false);
    expect(isPublicReviewPath("/invoices/12")).toBe(false);
    expect(isPublicReviewPath("/api/invoices")).toBe(false);
    expect(isPublicReviewPath("/estimates/12")).toBe(false);
  });

  it("does not allow prefix look-alikes without the trailing slash", () => {
    expect(isPublicReviewPath("/invoice-reviewx/tok")).toBe(false);
    expect(isPublicReviewPath("/estimate-reviewx/tok")).toBe(false);
    expect(isPublicReviewPath("/invoice-review")).toBe(false);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeGateway } from "@/lib/stripe/fakeGateway";

const orgFindUniqueOrThrow = vi.fn();
const orgUpdate = vi.fn();
const orgUpdateMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    organization: {
      findUniqueOrThrow: orgFindUniqueOrThrow,
      update: orgUpdate,
      updateMany: orgUpdateMany,
    },
  },
}));

const { ensureConnectAccount, mirrorAccountStatus } = await import(
  "@/lib/stripe/onboarding"
);

beforeEach(() => vi.clearAllMocks());

describe("ensureConnectAccount", () => {
  it("returns the existing account id without creating a new one", async () => {
    orgFindUniqueOrThrow.mockResolvedValue({
      stripeConnectAccountId: "acct_x",
    });
    const g = makeFakeGateway();
    expect(await ensureConnectAccount("org1", g)).toBe("acct_x");
    expect(g.calls.map((c) => c.name)).not.toContain("createConnectAccount");
    expect(orgUpdate).not.toHaveBeenCalled();
  });

  it("creates + persists the account id and sets status 'pending' when none exists", async () => {
    orgFindUniqueOrThrow.mockResolvedValue({ stripeConnectAccountId: null });
    orgUpdate.mockResolvedValue({});
    const g = makeFakeGateway();

    const id = await ensureConnectAccount("org1", g);
    expect(id).toMatch(/^acct_/);
    expect(orgUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "org1" },
        data: expect.objectContaining({
          stripeConnectAccountId: id,
          stripeOnboardingStatus: "pending",
        }),
      })
    );
  });
});

describe("mirrorAccountStatus", () => {
  it("maps charges_enabled → enabled and clears requirements", async () => {
    orgUpdateMany.mockResolvedValue({ count: 1 });
    await mirrorAccountStatus({
      id: "acct_x",
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
      requirements: { currently_due: [], past_due: [], disabled_reason: null },
    } as never);

    expect(orgUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { stripeConnectAccountId: "acct_x" },
        data: expect.objectContaining({
          stripeChargesEnabled: true,
          stripeOnboardingStatus: "enabled",
          stripeRequirementsDue: [],
        }),
      })
    );
  });

  it("maps outstanding requirements → action_needed", async () => {
    orgUpdateMany.mockResolvedValue({ count: 1 });
    await mirrorAccountStatus({
      id: "acct_x",
      charges_enabled: false,
      payouts_enabled: false,
      details_submitted: true,
      requirements: {
        currently_due: ["business_profile.url"],
        past_due: [],
        disabled_reason: null,
      },
    } as never);

    const data = orgUpdateMany.mock.calls[0][0].data;
    expect(data.stripeOnboardingStatus).toBe("action_needed");
    expect(data.stripeRequirementsDue).toEqual(["business_profile.url"]);
  });
});

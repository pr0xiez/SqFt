import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { approveEstimateByToken } from "@/lib/repositories/estimateApprovalRepo";

async function makeSentEstimate() {
  const org = await prisma.organization.create({
    data: {
      name: "Approve Co",
      slug: `appr-${Date.now()}-${Math.round(performance.now())}`,
    },
  });
  const customer = await prisma.customer.create({
    data: { orgId: org.id, name: "Pat" },
  });
  const location = await prisma.location.create({
    data: { orgId: org.id, customerId: customer.id, address: "12 Oak St" },
  });
  const siteMeasure = await prisma.siteMeasure.create({
    data: {
      orgId: org.id,
      locationId: location.id,
      siteMeasureNumber: 1,
      title: "Kitchen",
    },
  });
  const estimate = await prisma.estimate.create({
    data: {
      orgId: org.id,
      siteMeasureId: siteMeasure.id,
      estimateNumber: 1,
      status: "sent",
      approvalToken: `tok-${Date.now()}-${Math.round(performance.now())}`,
    },
  });
  return { orgId: org.id, siteMeasureId: siteMeasure.id, estimateId: estimate.id };
}

describe("approveEstimateByToken", () => {
  it("sets status=approved, writes EstimateApproval (no signature), logs event", async () => {
    const { estimateId } = await makeSentEstimate();
    const res = await approveEstimateByToken({
      estimateId,
      ip: "1.2.3.4",
      userAgent: "jest",
      snapshot: { totals: { total: 100 } },
    });
    expect(res).toBe("ok");
    const e = await prisma.estimate.findUnique({
      where: { id: estimateId },
      include: { approval: true, estimateEvents: true },
    });
    expect(e?.status).toBe("approved");
    expect(e?.approvedAt).toBeTruthy();
    expect(e?.approval?.ip).toBe("1.2.3.4");
    expect(e?.approval).not.toHaveProperty("signatureData");
    expect(e?.estimateEvents.some((ev) => ev.type === "approved")).toBe(true);
  });

  it("supersedes open sibling estimates under the same site measure", async () => {
    const { orgId, siteMeasureId, estimateId } = await makeSentEstimate();
    const sibling = await prisma.estimate.create({
      data: {
        orgId,
        siteMeasureId,
        estimateNumber: 2,
        status: "sent",
        approvalToken: `tok-sib-${Date.now()}-${Math.round(performance.now())}`,
      },
    });

    const res = await approveEstimateByToken({
      estimateId,
      ip: "5.6.7.8",
      userAgent: "jest",
      snapshot: {},
    });
    expect(res).toBe("ok");

    const sib = await prisma.estimate.findUnique({
      where: { id: sibling.id },
      include: { estimateEvents: true },
    });
    expect(sib?.status).toBe("declined");
    expect(sib?.declineReason).toMatch(/Superseded/);
    expect(
      sib?.estimateEvents.some(
        (ev) => ev.type === "declined" && ev.source === "system_supersede"
      )
    ).toBe(true);
  });

  it("is idempotent / rejects a second approval", async () => {
    const { estimateId } = await makeSentEstimate();
    await approveEstimateByToken({
      estimateId,
      ip: "1",
      userAgent: "j",
      snapshot: {},
    });
    expect(
      await approveEstimateByToken({
        estimateId,
        ip: "1",
        userAgent: "j",
        snapshot: {},
      })
    ).toBe("already_approved");
  });

  it("returns 'declined' when the estimate is already declined", async () => {
    const { estimateId } = await makeSentEstimate();
    await prisma.estimate.update({
      where: { id: estimateId },
      data: { status: "declined", declinedAt: new Date() },
    });
    expect(
      await approveEstimateByToken({
        estimateId,
        ip: "1",
        userAgent: "j",
        snapshot: {},
      })
    ).toBe("declined");
  });

  it("returns 'not_found' when the estimate doesn't exist", async () => {
    expect(
      await approveEstimateByToken({
        estimateId: 999999999,
        ip: "1",
        userAgent: "j",
        snapshot: {},
      })
    ).toBe("not_found");
  });
});

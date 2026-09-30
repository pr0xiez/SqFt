import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  approveEstimateByToken,
  getEstimateApproval,
} from "@/lib/repositories/estimateApprovalRepo";

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
  return {
    orgId: org.id,
    siteMeasureId: siteMeasure.id,
    estimateId: estimate.id,
  };
}

// Integration test against the real database. Runs locally (DATABASE_URL is
// loaded from .env by vitest.setup.ts) and is skipped in CI's DB-less unit
// job, where database behavior is covered by the Playwright e2e suite instead.
describe.skipIf(!process.env.VITEST_DB_AVAILABLE)(
  "approveEstimateByToken",
  () => {
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

    it("keeps concurrent sibling approvals and their supersede events consistent", async () => {
      const { orgId, siteMeasureId, estimateId } = await makeSentEstimate();
      try {
        const sibling = await prisma.estimate.create({
          data: {
            orgId,
            siteMeasureId,
            estimateNumber: 2,
            status: "sent",
          },
        });
        const outcomes = await Promise.allSettled(
          [estimateId, sibling.id].map((id) =>
            approveEstimateByToken({
              estimateId: id,
              ip: null,
              userAgent: null,
              snapshot: {},
            })
          )
        );
        expect(
          outcomes.some(
            (result) => result.status === "fulfilled" && result.value === "ok"
          )
        ).toBe(true);
        const rows = await prisma.estimate.findMany({
          where: { orgId },
          include: { approval: true, estimateEvents: true },
        });
        expect(rows.filter((row) => row.status === "approved")).toHaveLength(1);
        expect(rows.filter((row) => row.status === "declined")).toHaveLength(1);
        for (const row of rows) {
          if (row.status === "approved") {
            expect(row.approval).not.toBeNull();
            expect(row.declinedAt).toBeNull();
            expect(
              row.estimateEvents.some(
                (event) => event.source === "system_supersede"
              )
            ).toBe(false);
          } else {
            expect(row.approval).toBeNull();
            expect(
              row.estimateEvents.filter(
                (event) => event.source === "system_supersede"
              )
            ).toHaveLength(1);
          }
        }
      } finally {
        await prisma.organization.delete({ where: { id: orgId } });
      }
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
  }
);

describe.skipIf(!process.env.VITEST_DB_AVAILABLE)("getEstimateApproval", () => {
  it("returns the approval when scoped to the owning org", async () => {
    const { orgId, estimateId } = await makeSentEstimate();
    const res = await approveEstimateByToken({
      estimateId,
      ip: "1.2.3.4",
      userAgent: "jest",
      snapshot: { totals: { total: 100 } },
    });
    expect(res).toBe("ok");

    const approval = await getEstimateApproval(estimateId, orgId);
    expect(approval?.estimateId).toBe(estimateId);
    expect(approval?.ip).toBe("1.2.3.4");
  });

  it("returns null when scoped to a different org (cross-tenant read blocked)", async () => {
    const { estimateId } = await makeSentEstimate();
    await approveEstimateByToken({
      estimateId,
      ip: "1.2.3.4",
      userAgent: "jest",
      snapshot: {},
    });

    const otherOrg = await prisma.organization.create({
      data: {
        name: "Other Co",
        slug: `other-${Date.now()}-${Math.round(performance.now())}`,
      },
    });

    const approval = await getEstimateApproval(estimateId, otherOrg.id);
    expect(approval).toBeNull();
  });
});

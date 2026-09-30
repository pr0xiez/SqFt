import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { listCustomers } from "@/lib/repositories/customerRepo";

describe.skipIf(!process.env.VITEST_DB_AVAILABLE)(
  "customer aggregation on PostgreSQL",
  () => {
    it("preserves database collation, page membership, filtered summaries, and facet relaxation", async () => {
      const org = await prisma.organization.create({
        data: { name: "Query review", slug: `query-${randomUUID()}` },
      });
      const other = await prisma.organization.create({
        data: { name: "Other query", slug: `query-${randomUUID()}` },
      });
      try {
        const names = ["alice", "Bob", "Carol", "dave", "Eve", "Bob"];
        const customers = [];
        for (const [index, name] of names.entries())
          customers.push(
            await prisma.customer.create({
              data: {
                orgId: org.id,
                name,
                source: index === 1 ? "online" : "phone",
              },
            })
          );
        await prisma.customer.create({
          data: { orgId: other.id, name: "alice", source: "phone" },
        });
        let number = 1;
        for (const index of [0, 1]) {
          const location = await prisma.location.create({
            data: {
              orgId: org.id,
              customerId: customers[index].id,
              address: "12 Review Street",
            },
          });
          const measure = await prisma.siteMeasure.create({
            data: {
              orgId: org.id,
              locationId: location.id,
              siteMeasureNumber: index + 1,
            },
          });
          for (const status of index === 0 ? ["sent", "viewed"] : ["approved"])
            await prisma.estimate.create({
              data: {
                orgId: org.id,
                siteMeasureId: measure.id,
                estimateNumber: number++,
                status,
              },
            });
        }
        const params = {
          page: 2,
          perPage: 2,
          sort: { key: "name" as const, direction: "asc" as const },
          q: "",
          source: "all",
          pipeline: "any" as const,
        };
        const nativePage = await prisma.customer.findMany({
          where: { orgId: org.id },
          orderBy: [{ name: "asc" }, { id: "asc" }],
          take: 2,
          skip: 2,
          select: { id: true },
        });
        const page = await listCustomers(org.id, params);
        expect(page.items.map((customer) => customer.id)).toEqual(
          nativePage.map((customer) => customer.id)
        );
        expect(page.total).toBe(6);
        expect(page.summary).toEqual({ openEstimates: 2, won: 1, withOpen: 1 });
        expect(page.facets).toMatchObject({
          "source:phone": 5,
          "source:online": 1,
          "source:all": 6,
          "pipeline:any": 6,
          "pipeline:open": 1,
          "pipeline:accepted": 1,
          "pipeline:cold": 4,
        });
        const open = await listCustomers(org.id, {
          ...params,
          page: 1,
          q: "ali",
          source: "phone",
          pipeline: "open",
        });
        expect(open.total).toBe(1);
        expect(open.items[0].id).toBe(customers[0].id);
        expect(open.summary).toEqual({ openEstimates: 2, won: 0, withOpen: 1 });
        expect(open.facets["source:all"]).toBe(1);
        expect(open.facets["pipeline:any"]).toBe(1);
        const cold = await listCustomers(org.id, {
          ...params,
          page: 1,
          pipeline: "cold",
        });
        expect(cold.total).toBe(4);
        expect(cold.summary).toEqual({ openEstimates: 0, won: 0, withOpen: 0 });
        expect(cold.facets["pipeline:open"]).toBe(1);
        const outOfRange = await listCustomers(org.id, { ...params, page: 99 });
        expect(outOfRange.items).toEqual([]);
        expect(outOfRange.total).toBe(6);
      } finally {
        await prisma.organization.deleteMany({
          where: { id: { in: [org.id, other.id] } },
        });
      }
    });
  }
);

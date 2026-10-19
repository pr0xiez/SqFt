import { viewFromPrisma } from "@/lib/estimateView";
import { prisma } from "@/lib/prisma";

/**
 * One-off backfill for the denormalized Estimate.total column (added in the
 * `pagination` migration). Recomputes every estimate's total the same way
 * `syncEstimateTotal` does on write: null when there are no line items, else
 * `viewFromPrisma(...).total`. Idempotent — safe to
 * re-run.
 *
 * Run with: npm run backfill:estimate-total
 */
async function main() {
  const estimates = await prisma.estimate.findMany({
    select: {
      id: true,
      markupPct: true,
      depositPct: true,
      lineItems: true,
      siteMeasure: { select: { items: true } },
    },
  });
  let updated = 0;
  for (const e of estimates) {
    const total = e.lineItems.length === 0 ? null : viewFromPrisma(e).total;
    await prisma.estimate.update({ where: { id: e.id }, data: { total } });
    updated++;
  }
  console.log(`Backfilled total on ${updated} estimates`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

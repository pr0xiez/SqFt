/** Prisma `select` covering everything `computeEstimateView` needs, plus
 *  `approvedAt` for callers that bucket by week/day within the range. */
export const approvedRevenueSelect = {
  markupPct: true,
  depositPct: true,
  approvedAt: true,
  lineItems: {
    select: {
      id: true,
      name: true,
      description: true,
      rate: true,
      qtyMode: true,
      qty: true,
      wastePct: true,
      unitLabel: true,
      linkedRoomIds: true,
      sortOrder: true,
    },
  },
  siteMeasure: {
    select: {
      items: {
        select: {
          id: true,
          type: true,
          name: true,
          shape: true,
          w: true,
          l: true,
          segments: true,
          note: true,
          text: true,
        },
      },
    },
  },
} as const;

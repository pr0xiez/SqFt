/**
 * Default content that every newly-created Organization receives when
 * `createOrganization` is called with `seed: "minimal"` (the default).
 *
 * Currently: 6 starter line-item templates copied from the historical
 * prisma/seed.ts demo data. Both `createOrganization` and the seed script
 * pull from this constant so they cannot drift.
 */

export type DefaultLineItemTemplate = {
  name: string;
  description: string;
  rate: number;
  unitLabel: string;
  sortOrder: number;
};

export const DEFAULT_LINE_ITEM_TEMPLATES: ReadonlyArray<DefaultLineItemTemplate> =
  [
    {
      name: "LVP — Mohawk RevWood",
      description:
        "Luxury vinyl plank, 5.5mm wear layer. Includes click-lock install over prepped subfloor.",
      rate: 4.85,
      unitLabel: "sqft",
      sortOrder: 0,
    },
    {
      name: "White oak — select grade",
      description:
        '3/4" solid hardwood, select grade. Material only — site-finished separately.',
      rate: 7.2,
      unitLabel: "sqft",
      sortOrder: 1,
    },
    {
      name: "Hardwood install — nail down",
      description: 'Nail-down install over 3/4" plywood subfloor.',
      rate: 3.8,
      unitLabel: "sqft",
      sortOrder: 2,
    },
    {
      name: "Carpet removal & disposal",
      description: "Includes haul-away and dump fees.",
      rate: 1.2,
      unitLabel: "sqft",
      sortOrder: 3,
    },
    {
      name: "Quarter round trim",
      description: "Stain-grade pine quarter round, cut and installed.",
      rate: 2.5,
      unitLabel: "lf",
      sortOrder: 4,
    },
    {
      name: "Floor prep & leveling",
      description: "Self-leveling compound where needed.",
      rate: 0.65,
      unitLabel: "sqft",
      sortOrder: 5,
    },
  ];

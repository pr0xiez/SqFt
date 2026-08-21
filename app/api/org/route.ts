import { z } from "zod";
import { NotFoundError } from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/route";
import {
  getOrgSettings,
  updateOrgSettings,
} from "@/lib/repositories/organizationRepo";

export const GET = apiRoute(async ({ orgId }) => {
  const org = await getOrgSettings(orgId);
  if (!org) throw new NotFoundError();
  return org;
});

const TIMEZONE_RE = /^[A-Za-z]+\/[A-Za-z_-]+(\/[A-Za-z_-]+)?$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

const PatchBody = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    timezone: z.string().regex(TIMEZONE_RE).optional(),
    locale: z.enum(["en-US", "en-CA", "es-MX"]).optional(),
    brandColor: z
      .string()
      .regex(HEX_RE)
      .transform((v) => v.toLowerCase())
      .optional(),
    tagline: z
      .string()
      .max(120)
      .optional()
      .transform((v) => (v === undefined ? undefined : v === "" ? null : v)),
    showLicenseOnEstimates: z.boolean().optional(),
    defaultDepositPct: z.number().min(0).max(1).optional(),
    defaultValidityDays: z.number().int().min(1).max(365).optional(),
    defaultUnitLabel: z.enum(["ft²", "yd²", "m²"]).optional(),
    defaultTerms: z.string().max(2000).optional(),
  })
  .strict();

export const PATCH = apiRoute(
  { minRole: "admin", input: PatchBody },
  async ({ orgId, input }) => {
    const data = Object.fromEntries(
      Object.entries(input).filter(([, v]) => v !== undefined)
    );
    return updateOrgSettings(orgId, data);
  }
);

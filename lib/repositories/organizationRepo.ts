import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { ConnectStatus } from "@/lib/stripe/connect";

export type OrgSummary = {
  id: string;
  name: string;
  slug: string;
  subscriptionStatus: string;
  createdAt: Date;
};

/** Fetch a single org by id for the super-admin detail page / route checks. */
export function getOrgById(id: string): Promise<OrgSummary | null> {
  return prisma.organization.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      slug: true,
      subscriptionStatus: true,
      createdAt: true,
    },
  });
}

const ORG_SETTINGS_SELECT = {
  id: true,
  name: true,
  phone: true,
  address: true,
  licenseNumber: true,
  logo: true,
  timezone: true,
  locale: true,
  brandColor: true,
  tagline: true,
  showLicenseOnEstimates: true,
  defaultDepositPct: true,
  defaultValidityDays: true,
  defaultUnitLabel: true,
  defaultTerms: true,
} satisfies Prisma.OrganizationSelect;

export type OrgSettings = Prisma.OrganizationGetPayload<{
  select: typeof ORG_SETTINGS_SELECT;
}>;

/** The caller's own org's editable settings, for `GET /api/org`. */
export function getOrgSettings(orgId: string): Promise<OrgSettings | null> {
  return prisma.organization.findUnique({
    where: { id: orgId },
    select: ORG_SETTINGS_SELECT,
  });
}

/** Same read, but throws if the session's org somehow doesn't exist — used by
 *  the workspace settings server component, which has no not-found path of
 *  its own. */
export function getOrgSettingsOrThrow(orgId: string): Promise<OrgSettings> {
  return prisma.organization.findUniqueOrThrow({
    where: { id: orgId },
    select: ORG_SETTINGS_SELECT,
  });
}

export type OrgSettingsPatch = Partial<
  Pick<
    Prisma.OrganizationUncheckedUpdateInput,
    Exclude<keyof typeof ORG_SETTINGS_SELECT, "id">
  >
>;

/** `PATCH /api/org` — org-scoped by construction: the caller's own orgId is
 *  the row being written, no separate ownership check needed. */
export function updateOrgSettings(
  orgId: string,
  data: OrgSettingsPatch
): Promise<OrgSettings> {
  return prisma.organization.update({
    where: { id: orgId },
    data,
    select: ORG_SETTINGS_SELECT,
  });
}

const ADMIN_ORG_SELECT = {
  id: true,
  name: true,
  slug: true,
  subscriptionStatus: true,
  trialEndsAt: true,
  currentPeriodEndsAt: true,
  createdAt: true,
  _count: { select: { users: true } },
} satisfies Prisma.OrganizationSelect;

export type AdminOrgSummary = {
  id: string;
  name: string;
  slug: string;
  subscriptionStatus: string;
  trialEndsAt: Date | null;
  currentPeriodEndsAt: Date | null;
  createdAt: Date;
  userCount: number;
};

/**
 * List every organization on the platform for the super-admin console.
 * Deliberately NOT org-scoped — every caller must already be gated by
 * `apiRoute({ superAdmin: true })` (routes) or `isSuperAdmin` (server
 * components) before this runs.
 */
export async function listAllOrgsForAdmin(): Promise<AdminOrgSummary[]> {
  const rows = await prisma.organization.findMany({
    select: ADMIN_ORG_SELECT,
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    subscriptionStatus: r.subscriptionStatus,
    trialEndsAt: r.trialEndsAt,
    currentPeriodEndsAt: r.currentPeriodEndsAt,
    createdAt: r.createdAt,
    userCount: r._count.users,
  }));
}

/** Platform-wide org count for the super-admin dashboard. Not org-scoped —
 *  same caller-gating requirement as {@link listAllOrgsForAdmin}. */
export function countOrgsForAdmin(): Promise<number> {
  return prisma.organization.count();
}

/** `{name, phone, logo}` for the estimate-send email header. */
export function getOrgSendInfo(orgId: string) {
  return prisma.organization.findUniqueOrThrow({
    where: { id: orgId },
    select: { name: true, phone: true, logo: true },
  });
}

export async function getOrgStripe(orgId: string) {
  return prisma.organization.findUniqueOrThrow({
    where: { id: orgId },
    select: {
      name: true,
      stripeConnectAccountId: true,
      stripeConnectStatus: true,
    },
  });
}

/**
 * Resolve the org that owns a Stripe connected account. The webhook trusts
 * `event.account` (signed) — not caller-supplied metadata — so this is the
 * authoritative org for a payment. Returns null when no org owns the account.
 */
export async function getOrgIdByConnectAccount(
  accountId: string
): Promise<string | null> {
  const org = await prisma.organization.findFirst({
    where: { stripeConnectAccountId: accountId },
    select: { id: true },
  });
  return org?.id ?? null;
}

export async function setOrgConnectAccount(
  orgId: string,
  accountId: string,
  status: ConnectStatus
) {
  await prisma.organization.update({
    where: { id: orgId },
    data: { stripeConnectAccountId: accountId, stripeConnectStatus: status },
  });
}

/**
 * Write-through cache of the account's capability status.
 *
 * Guarded so an unchanged status writes nothing: the settings page refreshes
 * this on every poll (up to ~24 in a post-onboarding window), and all but the
 * one poll that actually moves the status would otherwise spend a round trip
 * and a row lock rewriting an identical string on the response's critical path.
 * `updateMany` is deliberate — it no-ops instead of throwing when the WHERE
 * doesn't match, which is exactly the "nothing changed" case.
 */
export async function setOrgConnectStatus(
  orgId: string,
  status: ConnectStatus,
  onboardedAt?: Date
) {
  const stampOnboardedAt = status === "active" && onboardedAt !== undefined;
  await prisma.organization.updateMany({
    where: {
      id: orgId,
      OR: [
        // `not` is spelled out against null so the filter's NULL handling
        // doesn't depend on the Prisma version.
        { stripeConnectStatus: null },
        { stripeConnectStatus: { not: status } },
        // Already active but never stamped: still needs the timestamp.
        ...(stampOnboardedAt ? [{ stripeConnectOnboardedAt: null }] : []),
      ],
    },
    data: {
      stripeConnectStatus: status,
      ...(stampOnboardedAt ? { stripeConnectOnboardedAt: onboardedAt } : {}),
    },
  });
}

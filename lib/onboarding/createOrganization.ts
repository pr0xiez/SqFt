/**
 * createOrganization — the single source of truth for tenant creation.
 *
 * Used by:
 *   - prisma/seed.ts (demo orgs)
 *   - app/api/admin/orgs/route.ts (manual super-admin onboarding) — Phase 2
 *   - app/api/test/orgs/route.ts (E2E fixture) — Phase 3
 *   - app/api/stripe/webhook/route.ts (self-serve signup) — Phase 4
 *
 * Runs in one Prisma transaction. Any failure rolls back; partial tenants
 * never persist.
 */
import bcrypt from "bcryptjs";
import { EmailTakenError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_LINE_ITEM_TEMPLATES,
  type DefaultLineItemTemplate,
} from "./defaultOrgContent";
import { OnboardingError, SlugExhaustedError } from "./errors";
import { kebabSlug } from "./slug";

const BCRYPT_ROUNDS = 10;
const BCRYPT_HASH_RE = /^\$2[aby]\$/;
const MAX_SLUG_ATTEMPTS = 20;

export type CreateOrganizationArgs = {
  org: { name: string; slug?: string };
  admin: { name: string; email: string; password: string };
  billing:
    | { kind: "manual" }
    | {
        kind: "stripe";
        customerId: string;
        subscriptionId: string;
        status: "trialing" | "active";
        trialEndsAt: Date | null;
        currentPeriodEndsAt: Date;
      };
  seed?: "minimal" | "none";
};

export type CreateOrganizationResult = {
  orgId: string;
  adminUserId: string;
  slug: string;
};

export async function createOrganization(
  args: CreateOrganizationArgs
): Promise<CreateOrganizationResult> {
  const seedKind = args.seed ?? "minimal";
  const passwordHash = await hashIfNeeded(args.admin.password);

  // Pre-flight: email uniqueness check. The User.email column has a unique
  // index so the transaction would also catch this, but we surface a typed
  // error message instead of a Prisma P2002.
  const existingUser = await prisma.user.findUnique({
    where: { email: args.admin.email.toLowerCase() },
    select: { id: true },
  });
  if (existingUser) throw new EmailTakenError();

  const baseSlug = args.org.slug ?? kebabSlug(args.org.name);

  try {
    return await prisma.$transaction(async (tx) => {
      const finalSlug = await resolveSlug(tx, baseSlug);
      const billingFields = billingToFields(args.billing);

      const org = await tx.organization.create({
        data: {
          name: args.org.name,
          slug: finalSlug,
          ...billingFields,
        },
        select: { id: true, slug: true },
      });

      const user = await tx.user.create({
        data: {
          name: args.admin.name,
          email: args.admin.email.toLowerCase(),
          password: passwordHash,
          role: "admin",
          orgId: org.id,
        },
        select: { id: true },
      });

      if (seedKind === "minimal") {
        await tx.lineItemTemplate.createMany({
          data: DEFAULT_LINE_ITEM_TEMPLATES.map(
            (t: DefaultLineItemTemplate) => ({ ...t, orgId: org.id })
          ),
        });
      }

      return { orgId: org.id, adminUserId: user.id, slug: org.slug };
    });
  } catch (err) {
    if (err instanceof EmailTakenError || err instanceof SlugExhaustedError) {
      throw err;
    }
    if (isPrismaUniqueViolation(err, "email")) throw new EmailTakenError();
    throw new OnboardingError(
      err instanceof Error ? err.message : "Failed to create organization"
    );
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

async function hashIfNeeded(password: string): Promise<string> {
  if (BCRYPT_HASH_RE.test(password)) return password;
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function resolveSlug(tx: TxClient, base: string): Promise<string> {
  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const existing = await tx.organization.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  throw new SlugExhaustedError(base);
}

function billingToFields(billing: CreateOrganizationArgs["billing"]) {
  if (billing.kind === "manual") {
    return {
      subscriptionStatus: "manual" as const,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      trialEndsAt: null,
      currentPeriodEndsAt: null,
    };
  }
  return {
    subscriptionStatus: billing.status,
    stripeCustomerId: billing.customerId,
    stripeSubscriptionId: billing.subscriptionId,
    trialEndsAt: billing.trialEndsAt,
    currentPeriodEndsAt: billing.currentPeriodEndsAt,
  };
}

function isPrismaUniqueViolation(err: unknown, fieldHint: string): boolean {
  // Prisma error shape varies between versions; duck-type to catch P2002 on
  // a unique that mentions the field.
  if (typeof err !== "object" || err === null) return false;
  const e = err as { code?: string; meta?: { target?: string[] | string } };
  if (e.code !== "P2002") return false;
  const target = e.meta?.target;
  if (!target) return false;
  if (Array.isArray(target)) return target.some((t) => t.includes(fieldHint));
  return target.includes(fieldHint);
}

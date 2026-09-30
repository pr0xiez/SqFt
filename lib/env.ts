import { z } from "zod";

/**
 * Single source of truth for `process.env` access.
 *
 * `DATABASE_URL` is the only var that is genuinely required to run the app;
 * everything else has documented optional/fallback behavior that predates
 * this file (see the comment on each field) and must keep working exactly as
 * before — this module only centralizes *how* they're read and typed, it
 * does not change semantics.
 *
 * Deliberately NOT parsed once at import time. Several consumers (and their
 * tests) rely on re-reading `process.env` on every call — e.g.
 * `isSuperAdmin()` re-reads `SUPER_ADMIN_EMAILS` so test setup can mutate it
 * per-test, and `getPublicBaseUrl()`/Stripe/email tests do the same for
 * their vars. A frozen module-level object computed once would go stale the
 * moment a test (or, in principle, a config reload) changes `process.env`
 * after import. `getEnv()` re-validates on every call instead — cheap, and
 * it keeps that existing "always re-read" contract intact.
 *
 * Required vars still fail fast in practice: modules that need one (like
 * `lib/prisma.ts`) call `getEnv()` at module load, so a misconfigured
 * deploy throws immediately on first import rather than lazily mid-request.
 */
const optionalString = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().min(1).optional()
);
const envSchema = z.object({
  /** The Postgres connection string (`lib/prisma.ts`, Prisma driver adapter). Required — nothing works without a DB. */
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  /** Resend API key (`lib/email/client.ts`). Optional — unset means email sends no-op into an in-memory test record instead of hitting the network (dev/test default). */
  RESEND_API_KEY: optionalString,
  /** From address for outgoing email (`lib/email/client.ts`). Optional, falls back to a sensible default. */
  EMAIL_FROM: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().min(1).default("SqFt Estimates <estimates@sqft.dev>")
  ),

  /** Geoapify address-autocomplete key (`lib/address/geoapify.ts`). Optional — unset just disables autocomplete suggestions; manual address entry still works. */
  GEOAPIFY_API_KEY: optionalString,

  /** Comma-separated super-admin allowlist (`lib/auth/superAdmin.ts`). Optional, defaults to empty (no super admins). */
  SUPER_ADMIN_EMAILS: z.string().default(""),

  /** Explicit override for the app's public base URL (`lib/baseUrl.ts`). Optional — falls back to Vercel-provided URL vars, then localhost. */
  PUBLIC_BASE_URL: optionalString,
  /** Vercel deployment target (`preview` | `production` | …), used to pick which Vercel URL var wins in `lib/baseUrl.ts`. */
  VERCEL_ENV: z.string().optional(),
  /** Stable per-branch preview URL, set by Vercel (`lib/baseUrl.ts`). */
  VERCEL_BRANCH_URL: z.string().optional(),
  /** Per-deployment URL, set by Vercel (`lib/baseUrl.ts`). */
  VERCEL_URL: z.string().optional(),
  /** Stable production custom-domain URL, set by Vercel (`lib/baseUrl.ts`). */
  VERCEL_PROJECT_PRODUCTION_URL: z.string().optional(),

  /** Stripe secret key (`lib/stripe/client.ts`). Optional — orgs use Stripe Connect opt-in; unconfigured just means Stripe features are unavailable (`isStripeConfigured()`). */
  STRIPE_SECRET_KEY: optionalString,
  /** Stripe webhook signing secret (`app/api/webhooks/stripe/route.ts`). Optional at the schema level; the webhook route itself 500s if it's missing when a webhook arrives. */
  STRIPE_WEBHOOK_SECRET: optionalString,
});

export type Env = z.infer<typeof envSchema>;

/**
 * Parses and validates `process.env` against {@link envSchema}. Re-run on
 * every call (see module doc) — throws a single descriptive error listing
 * every invalid/missing required field if validation fails.
 */
export function getEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration — ${issues}`);
  }
  return parsed.data;
}

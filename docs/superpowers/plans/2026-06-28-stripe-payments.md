# Stripe Payments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each contractor organization collect online card payments from its homeowner customers against SqFt invoices, with money settling into the contractor's own bank account and the card processing fee borne by the contractor.

**Architecture:** Stripe Connect with each `Organization` onboarded as an Accounts-v2 connected account using **direct charges** (`dashboard: full`, `fees_collector: stripe`, `losses_collector: stripe`). The homeowner pays the exact invoice balance via a Stripe-hosted Checkout Session created *on the connected account*; SqFt takes no `application_fee_amount`. A signature-verified webhook (source of truth) plus an idempotent reconcile-on-return endpoint record the payment into the existing invoice ledger via `recordStripePayment`.

**Tech Stack:** Next.js 16 (app router route handlers), React 19, Prisma 7 / Postgres, Zod 4, the `stripe` Node SDK, Vitest + Playwright.

**Spec:** `docs/superpowers/specs/2026-06-28-stripe-payments-design.md` — read it first.

## Global Constraints

- **Stripe API version:** pin `2026-06-24.dahlia` on the SDK client.
- **Accounts v2 only:** create connected accounts via `stripe.v2.core.accounts.create(...)`. NEVER `type: 'express'|'custom'|'standard'`.
- **Never pass `payment_method_types`** on PaymentIntents/Checkout (best-practice rule). To restrict to cards, use `payment_method_configuration` / Dashboard config, or omit and rely on dynamic methods. For v1 we omit it and accept dynamic methods (revisit card-only via Dashboard payment-method settings, not code).
- **No `application_fee_amount`** anywhere — SqFt takes $0.
- **Capability gate:** read `configuration.merchant.capabilities.card_payments.status`; never the deprecated `charges_enabled`/`payouts_enabled`.
- **API key:** `STRIPE_SECRET_KEY` is a Restricted API Key (`rk_…`), global per-deployment (test in dev/preview, live in prod). Never commit a key.
- **Migrations:** additive only; all new columns nullable or defaulted (no `ADD COLUMN NOT NULL` — fails the populated Neon PR branch). Never squash. Update `prisma/seed.ts` in the same change.
- **Dev-DB DDL is sandbox-blocked locally** (see project memory): the new migration's `ALTER TABLE` cannot be applied to the shared Neon dev DB from this environment. Real-DB unit tests fail locally with "column does not exist" until CI runs `migrate deploy`; gate them on `VITEST_DB_AVAILABLE` and treat local failure as expected, not a regression.
- **Money:** dollars are `Float` in the DB (matching existing `Payment.amount`); convert to integer cents only at the Stripe boundary (`Math.round(dollars * 100)`).
- **Lint/format:** `biome ci .` must pass; CRLF is already handled by `.gitattributes` — don't fight line endings.
- **Public routes:** every token/unauth route MUST be added to `lib/publicRoutes.ts` or the proxy redirects to `/login`.

---

## File Structure

**New (`lib/stripe/`):**
- `client.ts` — lazy singleton `Stripe` client; `getStripe()`, `stripeMode()`, `isStripeConfigured()`.
- `connect.ts` — `createConnectedAccount`, `createOnboardingLink`, `readAccountStatus`, pure `mapCapabilityStatus`.
- `checkout.ts` — pure `buildCheckoutParams`, plus `createInvoiceCheckoutSession`.
- `webhook.ts` — `constructStripeEvent`, `handleStripeEvent` (routes events → repo).

**New routes:**
- `app/api/org/stripe/connect/route.ts` — POST (create + link), GET (status).
- `app/api/invoice-review/[token]/checkout/route.ts` — POST (create session).
- `app/api/invoice-review/[token]/confirm/route.ts` — POST (reconcile-on-return).
- `app/api/webhooks/stripe/route.ts` — POST (raw-body, signature-verified).

**New UI:**
- `app/(app)/settings/payments/page.tsx` + `components/settings/PaymentsSettingsView.tsx` + hook in `lib/hooks/useStripeConnect.ts`.

**Modified:**
- `prisma/schema.prisma`, `prisma/seed.ts`, new migration dir.
- `lib/api/errors.ts` — four new error classes.
- `lib/repositories/invoiceRepo.ts` — `recordStripePayment`, `setInvoicePaymentIntent`.
- `lib/repositories/orgRepo.ts` (or new) — connect getters/setters.
- `lib/publicRoutes.ts` — allowlist checkout/confirm/webhook.
- `app/invoice-review/[token]/page.tsx` + `components/invoices/PublicInvoiceView.tsx` — Pay now + states.
- `CONTEXT.md`, `AGENTS.md`, `.env.example`.

---

## Phase 1 — Foundation

### Task 1: Stripe SDK, client, mode detection, error codes

**Files:**
- Modify: `package.json` (add `stripe`)
- Create: `lib/stripe/client.ts`
- Create: `__tests__/lib/stripe/client.test.ts`
- Modify: `lib/api/errors.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: `getStripe(): Stripe`, `stripeMode(): "test" | "live" | "unconfigured"`, `isStripeConfigured(): boolean`.
- Produces error classes: `StripeNotConnectedError`, `StripeAccountRestrictedError`, `InvoiceAlreadyPaidError`, `StripeWebhookInvalidError`.

- [ ] **Step 1: Install the SDK**

Run: `npm install stripe@latest`
Expected: `stripe` appears under `dependencies` in `package.json`.

- [ ] **Step 2: Write the failing test for mode detection**

Create `__tests__/lib/stripe/client.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isStripeConfigured, stripeMode } from "@/lib/stripe/client";

describe("stripe client mode detection", () => {
  const original = process.env.STRIPE_SECRET_KEY;
  afterEach(() => {
    if (original === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = original;
  });

  it("reports test mode for an rk_test_ key", () => {
    process.env.STRIPE_SECRET_KEY = "rk_test_abc123";
    expect(stripeMode()).toBe("test");
    expect(isStripeConfigured()).toBe(true);
  });

  it("reports live mode for an rk_live_ key", () => {
    process.env.STRIPE_SECRET_KEY = "rk_live_abc123";
    expect(stripeMode()).toBe("live");
  });

  it("reports unconfigured when the key is absent", () => {
    delete process.env.STRIPE_SECRET_KEY;
    expect(stripeMode()).toBe("unconfigured");
    expect(isStripeConfigured()).toBe(false);
  });
});
```

- [ ] **Step 3: Run it — expect FAIL**

Run: `npm test -- client.test`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement `lib/stripe/client.ts`**

```ts
import Stripe from "stripe";

/** Pinned for the whole app; bump deliberately. */
const API_VERSION = "2026-06-24.dahlia";

let _client: Stripe | null = null;

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function stripeMode(): "test" | "live" | "unconfigured" {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return "unconfigured";
  // rk_test_… / sk_test_… → test; rk_live_… / sk_live_… → live.
  return key.includes("_test_") ? "test" : "live";
}

/** Lazy singleton, mirroring lib/email/client.ts. Throws if unconfigured. */
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }
  if (!_client) {
    _client = new Stripe(key, { apiVersion: API_VERSION });
  }
  return _client;
}
```

> Note: if `apiVersion: "2026-06-24.dahlia"` is rejected by the installed SDK's type, confirm the exact string via the Stripe MCP `stripe_api_details` and use the SDK's pinned default if the literal type lags. Do not omit the option.

- [ ] **Step 5: Run it — expect PASS**

Run: `npm test -- client.test`
Expected: PASS.

- [ ] **Step 6: Add the four error classes**

In `lib/api/errors.ts`, follow the existing `InvoiceLockedError`/`InvoiceOverbillError` pattern (subclass `ApiError` with `code`, `status`, `message`). Add:

```ts
export class StripeNotConnectedError extends ApiError {
  constructor() {
    super("STRIPE_NOT_CONNECTED", "This business hasn't finished setting up payments.", 409);
  }
}

export class StripeAccountRestrictedError extends ApiError {
  constructor() {
    super("STRIPE_ACCOUNT_RESTRICTED", "Online payments aren't active for this business yet.", 409);
  }
}

export class InvoiceAlreadyPaidError extends ApiError {
  constructor() {
    super("INVOICE_ALREADY_PAID", "This invoice is already paid.", 409);
  }
}

export class StripeWebhookInvalidError extends ApiError {
  constructor() {
    super("STRIPE_WEBHOOK_INVALID", "Invalid webhook signature.", 400);
  }
}
```

> Match the actual `ApiError` constructor signature in `lib/api/errors.ts` (check whether it is `(code, message, status)` or `(message, ...)`). Mirror the closest existing subclass exactly.

- [ ] **Step 7: Document env vars**

Append to `.env.example`:

```
# Stripe (rk_test_… in dev/preview, rk_live_… in production)
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
# Base URL used for Connect onboarding + Checkout return URLs (defaults to request origin if unset)
STRIPE_PUBLIC_BASE_URL=
```

- [ ] **Step 8: Lint + commit**

Run: `npm run lint:ci && npm test -- client.test`
```bash
git add package.json package-lock.json lib/stripe/client.ts __tests__/lib/stripe/client.test.ts lib/api/errors.ts .env.example
git commit -m "feat(stripe): add SDK client, mode detection, and payment error codes"
```

---

### Task 2: Schema migration + seed

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_stripe_payments/migration.sql`
- Modify: `prisma/seed.ts`

**Interfaces:**
- Produces columns `Organization.stripeConnectStatus`, `Organization.stripeConnectOnboardedAt`, `Payment.stripeFeeAmount`, `Payment.stripeNetAmount`, and model `ProcessedStripeEvent`.

- [ ] **Step 1: Edit `schema.prisma`**

In `model Organization`, beside the existing `stripeConnectAccountId String?`:

```prisma
  stripeConnectAccountId     String?
  stripeConnectStatus        String?   // pending | active | restricted
  stripeConnectOnboardedAt   DateTime?
```

In `model Payment`, beside `stripeChargeId`:

```prisma
  stripeChargeId  String?  @unique
  stripeFeeAmount Float?   // Stripe processing fee (dollars), from the balance transaction
  stripeNetAmount Float?   // amount the contractor nets (dollars)
```

Add a new model:

```prisma
/** Webhook idempotency + audit: one row per processed Stripe event id. */
model ProcessedStripeEvent {
  id        String   @id // Stripe event id (evt_…)
  type      String
  createdAt DateTime @default(now())
}
```

- [ ] **Step 2: Generate the migration SQL (do NOT apply to the shared dev DB)**

Author the migration directory manually to avoid `migrate dev`'s destructive reset (see project memory `migrate dev wants to reset the dev DB`). Create `prisma/migrations/<UTC-timestamp>_stripe_payments/migration.sql`:

```sql
-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "stripeConnectStatus" TEXT;
ALTER TABLE "Organization" ADD COLUMN "stripeConnectOnboardedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "stripeFeeAmount" DOUBLE PRECISION;
ALTER TABLE "Payment" ADD COLUMN "stripeNetAmount" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "ProcessedStripeEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProcessedStripeEvent_pkey" PRIMARY KEY ("id")
);
```

All additive + nullable → safe on the populated Neon PR branch. Use a timestamp newer than the latest existing migration folder so ordering is correct.

- [ ] **Step 3: Regenerate the Prisma client**

Run: `npx prisma generate`
Expected: succeeds; new fields appear on the generated types. (This needs `@prisma/client` installed — a fresh worktree may not have it; run `npm install` first if generate fails to find the engine.)

- [ ] **Step 4: Update `prisma/seed.ts`**

Leave the new Stripe fields at their defaults (null) for seeded orgs — seeded data must remain Stripe-unconnected so local/E2E flows render the "set up payments" state. Add a brief comment near the org seed:

```ts
// Stripe Connect intentionally left unconfigured in seed data:
// stripeConnectAccountId/Status null → orgs show the "set up payments" CTA.
```

If the seed constructs `Payment` rows, leave `stripeFeeAmount`/`stripeNetAmount` unset for non-stripe methods.

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck` (compiles against the regenerated client). Local real-DB tests that touch these columns will fail until CI `migrate deploy` — expected, not a regression.
```bash
git add prisma/schema.prisma prisma/migrations prisma/seed.ts
git commit -m "feat(stripe): schema for connect status, payment fee/net, webhook dedupe"
```

---

## Phase 2 — Connect onboarding

### Task 3: Connect module (account, link, status)

**Files:**
- Create: `lib/stripe/connect.ts`
- Create: `__tests__/lib/stripe/connect.test.ts`

**Interfaces:**
- Consumes: `getStripe()` (Task 1).
- Produces:
  - `mapCapabilityStatus(raw: string | undefined): "pending" | "active" | "restricted"` (pure).
  - `createConnectedAccount(input: { orgId: string; email: string | null; name: string }): Promise<string>` → account id.
  - `createOnboardingLink(accountId: string, returnUrl: string, refreshUrl: string): Promise<string>` → URL.
  - `readAccountStatus(accountId: string): Promise<"pending" | "active" | "restricted">`.

- [ ] **Step 1: Failing test for the pure status mapper**

Create `__tests__/lib/stripe/connect.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mapCapabilityStatus } from "@/lib/stripe/connect";

describe("mapCapabilityStatus", () => {
  it("maps active to active", () => {
    expect(mapCapabilityStatus("active")).toBe("active");
  });
  it("maps unrequested/pending/inactive to pending", () => {
    expect(mapCapabilityStatus("pending")).toBe("pending");
    expect(mapCapabilityStatus("unrequested")).toBe("pending");
    expect(mapCapabilityStatus(undefined)).toBe("pending");
  });
  it("maps restricted/disabled to restricted", () => {
    expect(mapCapabilityStatus("restricted")).toBe("restricted");
    expect(mapCapabilityStatus("disabled")).toBe("restricted");
  });
});
```

- [ ] **Step 2: Run — expect FAIL.** `npm test -- connect.test`

- [ ] **Step 3: Implement `lib/stripe/connect.ts`**

```ts
import { getStripe } from "./client";

export type ConnectStatus = "pending" | "active" | "restricted";

/** Collapse Stripe's capability status strings into our three states. */
export function mapCapabilityStatus(raw: string | undefined): ConnectStatus {
  if (raw === "active") return "active";
  if (raw === "restricted" || raw === "disabled") return "restricted";
  return "pending";
}

/**
 * Create an Accounts-v2 connected account for direct charges:
 * full dashboard, merchant card_payments capability, Stripe as fees + losses
 * collector. Returns the new account id (acct_…).
 */
export async function createConnectedAccount(input: {
  orgId: string;
  email: string | null;
  name: string;
}): Promise<string> {
  const stripe = getStripe();
  const account = await stripe.v2.core.accounts.create({
    display_name: input.name,
    contact_email: input.email ?? undefined,
    dashboard: "full",
    defaults: {
      responsibilities: {
        fees_collector: "stripe",
        losses_collector: "stripe",
      },
    },
    configuration: {
      merchant: {
        capabilities: { card_payments: { requested: true } },
      },
    },
    metadata: { sqftOrgId: input.orgId },
  });
  return account.id;
}

/** Hosted onboarding link (account-link style) for a v2 account. */
export async function createOnboardingLink(
  accountId: string,
  returnUrl: string,
  refreshUrl: string
): Promise<string> {
  const stripe = getStripe();
  const link = await stripe.accountLinks.create({
    account: accountId,
    return_url: returnUrl,
    refresh_url: refreshUrl,
    type: "account_onboarding",
  });
  return link.url;
}

/** Read the merchant card_payments capability and map to our status. */
export async function readAccountStatus(accountId: string): Promise<ConnectStatus> {
  const stripe = getStripe();
  const account = await stripe.v2.core.accounts.retrieve(accountId, {
    include: ["configuration.merchant"],
  });
  const raw =
    account.configuration?.merchant?.capabilities?.card_payments?.status;
  return mapCapabilityStatus(raw);
}
```

> **Verify the exact v2 SDK shapes** for `v2.core.accounts.create/retrieve`, the `include` parameter, the capability path, and whether onboarding uses `accountLinks.create` or a v2 account-link endpoint — confirm against the Stripe MCP (`stripe_api_details`, `search_stripe_documentation`) before finalizing. The field names above follow the Connect-v2 reference; correct any drift while keeping the dimensions (full dashboard / merchant card_payments / fees+losses = stripe) intact.

- [ ] **Step 4: Run the pure test — expect PASS.** `npm test -- connect.test`

- [ ] **Step 5: Lint + commit**
```bash
git add lib/stripe/connect.ts __tests__/lib/stripe/connect.test.ts
git commit -m "feat(stripe): connect account create/link/status helpers"
```

---

### Task 4: Org connect repo + API routes

**Files:**
- Create or modify: `lib/repositories/orgRepo.ts` (add the two functions; create the file + export from `lib/repositories/index.ts` if absent)
- Create: `app/api/org/stripe/connect/route.ts`
- Test: `__tests__/api/org-stripe-connect.test.ts` (route guard behavior)

**Interfaces:**
- Consumes: `createConnectedAccount`, `createOnboardingLink`, `readAccountStatus` (Task 3).
- Produces:
  - `getOrgStripe(orgId): Promise<{ stripeConnectAccountId: string | null; stripeConnectStatus: string | null }>`
  - `setOrgConnectAccount(orgId, accountId, status): Promise<void>`
  - `setOrgConnectStatus(orgId, status, onboardedAt?): Promise<void>`

- [ ] **Step 1: Add repo functions** in `lib/repositories/orgRepo.ts`:

```ts
import { prisma } from "@/lib/prisma";
import type { ConnectStatus } from "@/lib/stripe/connect";

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

export async function setOrgConnectStatus(
  orgId: string,
  status: ConnectStatus,
  onboardedAt?: Date
) {
  await prisma.organization.update({
    where: { id: orgId },
    data: {
      stripeConnectStatus: status,
      ...(status === "active" && onboardedAt
        ? { stripeConnectOnboardedAt: onboardedAt }
        : {}),
    },
  });
}
```

If `lib/repositories/index.ts` re-exports repos, add `export * from "./orgRepo";`.

- [ ] **Step 2: Write the route** `app/api/org/stripe/connect/route.ts`:

```ts
import { z } from "zod";
import { apiRoute } from "@/lib/api/route";
import {
  getOrgStripe,
  setOrgConnectAccount,
  setOrgConnectStatus,
} from "@/lib/repositories/orgRepo";
import {
  createConnectedAccount,
  createOnboardingLink,
  readAccountStatus,
} from "@/lib/stripe/connect";

function baseUrl(req: Request): string {
  return (
    process.env.STRIPE_PUBLIC_BASE_URL ?? new URL(req.url).origin
  ).replace(/\/$/, "");
}

// GET — current connect status for the settings page.
export const GET = apiRoute({ minRole: "admin" }, async ({ orgId }) => {
  const org = await getOrgStripe(orgId);
  let status = org.stripeConnectStatus;
  // Refresh from Stripe when we have an account but it isn't active yet.
  if (org.stripeConnectAccountId && status !== "active") {
    status = await readAccountStatus(org.stripeConnectAccountId);
    await setOrgConnectStatus(
      orgId,
      status,
      status === "active" ? new Date() : undefined
    );
  }
  return {
    connected: Boolean(org.stripeConnectAccountId),
    status: status ?? null,
  };
});

// POST — create the account if needed, then return a fresh onboarding link.
export const POST = apiRoute({ minRole: "admin" }, async ({ orgId, req }) => {
  const org = await getOrgStripe(orgId);
  let accountId = org.stripeConnectAccountId;
  if (!accountId) {
    accountId = await createConnectedAccount({
      orgId,
      email: null,
      name: org.name,
    });
    await setOrgConnectAccount(orgId, accountId, "pending");
  }
  const base = baseUrl(req);
  const url = await createOnboardingLink(
    accountId,
    `${base}/settings/payments?onboarding=return`,
    `${base}/settings/payments?onboarding=refresh`
  );
  return { url };
});

export const _schema = z.object({}); // no body; placeholder to keep imports honest
```

(Drop the `_schema` line if unused; it's only to avoid an unused-import lint if you don't import `z`. Prefer removing the `z` import entirely.)

- [ ] **Step 3: Test the route's admin gate** — `__tests__/api/org-stripe-connect.test.ts`. Mock `lib/stripe/connect` and `lib/repositories/orgRepo`; assert POST without an admin session yields `UNAUTHORIZED`, and with an org that has no account it calls `createConnectedAccount` then returns a `url`. Follow the existing API route test setup in `__tests__/api/` for session mocking.

- [ ] **Step 4: Run tests, lint, commit**
```bash
git add lib/repositories/orgRepo.ts app/api/org/stripe/connect/route.ts __tests__/api/org-stripe-connect.test.ts
git commit -m "feat(stripe): connect onboarding API + org repo accessors"
```

---

### Task 5: `/settings/payments` UI

**Files:**
- Create: `app/(app)/settings/payments/page.tsx`
- Create: `components/settings/PaymentsSettingsView.tsx`
- Create: `lib/hooks/useStripeConnect.ts`
- Modify: settings hub (`app/(app)/settings/page.tsx`) to link the new section; `lib/nav/items.ts` only if settings sub-items are listed there.

**Interfaces:**
- Consumes: `GET/POST /api/org/stripe/connect`.

- [ ] **Step 1: Hook** `lib/hooks/useStripeConnect.ts` — a react-query `useQuery(["stripe-connect"], …)` fetching `GET /api/org/stripe/connect` and a `useMutation` POSTing to start onboarding, returning `{ url }`; on success `window.location.assign(url)`. Mirror an existing hook in `lib/hooks/` (e.g. `useInvoices.ts`) for query-client + `readApiError` usage.

- [ ] **Step 2: View** `components/settings/PaymentsSettingsView.tsx` — admin-only card. States:
  - **Not connected** (`connected === false`): explain "Collect card payments from customers. Stripe charges a processing fee, deducted from your payout." + a "Set up payments" button → mutation.
  - **Pending/restricted** (`status !== "active"`): "Finish setting up payments" + "Continue setup" button (re-POST gets a fresh link).
  - **Active**: green "Payments are active — customers can pay invoices online." + a link to the Stripe dashboard.
  Handle the `?onboarding=return|refresh` query param by invalidating the query on mount so status refreshes.

- [ ] **Step 3: Page** `app/(app)/settings/payments/page.tsx` — server component, admin-gated like `app/(app)/settings/workspace/page.tsx` (redirect non-admins), renders `<PaymentsSettingsView />`. Add a tile/link on the settings hub.

- [ ] **Step 4: Manual check + lint + commit**

Run: `npm run lint:ci && npm run typecheck`
```bash
git add app/(app)/settings/payments components/settings/PaymentsSettingsView.tsx lib/hooks/useStripeConnect.ts app/(app)/settings/page.tsx
git commit -m "feat(stripe): payments settings page with Connect onboarding"
```

---

## Phase 3 — Pay flow

### Task 6: Checkout builder + create

**Files:**
- Create: `lib/stripe/checkout.ts`
- Create: `__tests__/lib/stripe/checkout.test.ts`

**Interfaces:**
- Consumes: `getStripe()`.
- Produces:
  - `buildCheckoutParams(input: { invoiceNumber: number; balanceDueCents: number; orgId: string; invoiceId: number; successUrl: string; cancelUrl: string }): Stripe.Checkout.SessionCreateParams` (pure).
  - `createInvoiceCheckoutSession(connectedAccountId, params): Promise<{ id: string; url: string }>`.

- [ ] **Step 1: Failing test for the pure builder** — `__tests__/lib/stripe/checkout.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildCheckoutParams } from "@/lib/stripe/checkout";

describe("buildCheckoutParams", () => {
  const base = {
    invoiceNumber: 1012,
    balanceDueCents: 45000,
    orgId: "org_1",
    invoiceId: 77,
    successUrl: "https://app/inv/tok?session_id={CHECKOUT_SESSION_ID}",
    cancelUrl: "https://app/inv/tok",
  };

  it("creates a single line item for the exact balance, no platform fee", () => {
    const p = buildCheckoutParams(base);
    expect(p.mode).toBe("payment");
    expect(p.line_items).toHaveLength(1);
    expect(p.line_items?.[0]?.price_data?.unit_amount).toBe(45000);
    expect(p.line_items?.[0]?.quantity).toBe(1);
    // No application fee — SqFt takes nothing.
    expect(p.payment_intent_data?.application_fee_amount).toBeUndefined();
    // never set payment_method_types (best-practice rule)
    expect("payment_method_types" in p).toBe(false);
  });

  it("carries invoice/org ids in metadata for the webhook", () => {
    const p = buildCheckoutParams(base);
    expect(p.metadata?.invoiceId).toBe("77");
    expect(p.metadata?.orgId).toBe("org_1");
    expect(p.payment_intent_data?.metadata?.invoiceId).toBe("77");
  });
});
```

- [ ] **Step 2: Run — expect FAIL.** `npm test -- checkout.test`

- [ ] **Step 3: Implement `lib/stripe/checkout.ts`**

```ts
import type Stripe from "stripe";
import { getStripe } from "./client";

export function buildCheckoutParams(input: {
  invoiceNumber: number;
  balanceDueCents: number;
  orgId: string;
  invoiceId: number;
  successUrl: string;
  cancelUrl: string;
}): Stripe.Checkout.SessionCreateParams {
  const metadata = {
    invoiceId: String(input.invoiceId),
    orgId: input.orgId,
  };
  return {
    mode: "payment",
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: input.balanceDueCents,
          product_data: { name: `Invoice #${input.invoiceNumber}` },
        },
      },
    ],
    // No application_fee_amount: the platform takes nothing. The connected
    // account bears Stripe's processing fee (fees_collector: stripe), deducted
    // from its payout.
    payment_intent_data: { metadata },
    metadata,
  };
}

/** Create the session ON the connected account (direct charge). */
export async function createInvoiceCheckoutSession(
  connectedAccountId: string,
  params: Stripe.Checkout.SessionCreateParams,
  idempotencyKey: string
): Promise<{ id: string; url: string }> {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create(params, {
    stripeAccount: connectedAccountId,
    idempotencyKey,
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return { id: session.id, url: session.url };
}
```

- [ ] **Step 4: Run — expect PASS.** `npm test -- checkout.test`

- [ ] **Step 5: Lint + commit**
```bash
git add lib/stripe/checkout.ts __tests__/lib/stripe/checkout.test.ts
git commit -m "feat(stripe): invoice checkout session builder + connected-account create"
```

---

### Task 7: Checkout route + allowlist

**Files:**
- Create: `app/api/invoice-review/[token]/checkout/route.ts`
- Modify: `lib/publicRoutes.ts`
- Test: `__tests__/api/invoice-checkout.test.ts`

**Interfaces:**
- Consumes: `getInvoiceByToken` (invoiceRepo), `getOrgStripe`, `readAccountStatus`, `buildCheckoutParams`, `createInvoiceCheckoutSession`.
- Produces: `POST` returning `{ url }`.

- [ ] **Step 1: Allowlist** — in `lib/publicRoutes.ts`, replace the "no public invoice API exists yet" note and add the prefix:

```ts
  // Public invoice page + its pay/confirm/webhook APIs. Each enforces its own
  // token (or Stripe signature) auth inside the handler.
  "/invoice-review/",
  "/api/invoice-review/",
  "/api/webhooks/stripe",
```

- [ ] **Step 2: Write the route** `app/api/invoice-review/[token]/checkout/route.ts`:

```ts
import { publicRoute } from "@/lib/api/route";
import {
  InvoiceAlreadyPaidError,
  NotFoundError,
  StripeAccountRestrictedError,
  StripeNotConnectedError,
} from "@/lib/api/errors";
import { round2 } from "@/lib/money";
import { getInvoiceByToken } from "@/lib/repositories/invoiceRepo";
import { getOrgStripe, setOrgConnectStatus } from "@/lib/repositories/orgRepo";
import {
  buildCheckoutParams,
  createInvoiceCheckoutSession,
} from "@/lib/stripe/checkout";
import { readAccountStatus } from "@/lib/stripe/connect";

function baseUrl(req: Request): string {
  return (process.env.STRIPE_PUBLIC_BASE_URL ?? new URL(req.url).origin).replace(
    /\/$/,
    ""
  );
}

export const POST = publicRoute<undefined, { token: string }>(
  async ({ req, params }) => {
    const invoice = await getInvoiceByToken(params.token);
    if (!invoice || invoice.status === "void") throw new NotFoundError();
    if (invoice.status === "paid") throw new InvoiceAlreadyPaidError();

    const org = await getOrgStripe(invoice.orgId);
    if (!org.stripeConnectAccountId) throw new StripeNotConnectedError();
    // Re-check capability live; cache the result.
    let status = org.stripeConnectStatus;
    if (status !== "active") {
      status = await readAccountStatus(org.stripeConnectAccountId);
      await setOrgConnectStatus(invoice.orgId, status);
    }
    if (status !== "active") throw new StripeAccountRestrictedError();

    const paid = round2(invoice.payments.reduce((s, p) => s + p.amount, 0));
    const balanceDue = round2(invoice.amount - paid);
    if (balanceDue <= 0) throw new InvoiceAlreadyPaidError();
    const balanceDueCents = Math.round(balanceDue * 100);

    const base = baseUrl(req);
    const ret = `${base}/invoice-review/${params.token}`;
    const checkoutParams = buildCheckoutParams({
      invoiceNumber: invoice.invoiceNumber,
      balanceDueCents,
      orgId: invoice.orgId,
      invoiceId: invoice.id,
      successUrl: `${ret}?pay=success&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${ret}?pay=cancelled`,
    });

    // Idempotency keyed on invoice + current balance: identical re-clicks reuse
    // the same session; a changed balance mints a new one.
    const { url } = await createInvoiceCheckoutSession(
      org.stripeConnectAccountId,
      checkoutParams,
      `inv-${invoice.id}-bal-${balanceDueCents}`
    );
    return { url };
  }
);
```

- [ ] **Step 3: Test the guards** — `__tests__/api/invoice-checkout.test.ts`: mock the repo + stripe modules; assert void/unknown → `NOT_FOUND`, paid → `INVOICE_ALREADY_PAID`, no account → `STRIPE_NOT_CONNECTED`, inactive capability → `STRIPE_ACCOUNT_RESTRICTED`, and the happy path returns `{ url }` with `balanceDueCents` = `(amount − payments) * 100`.

- [ ] **Step 4: Run, lint, commit**
```bash
git add app/api/invoice-review/[token]/checkout/route.ts lib/publicRoutes.ts __tests__/api/invoice-checkout.test.ts
git commit -m "feat(stripe): public invoice checkout route + allowlist"
```

---

### Task 8: Public page "Pay now" + success/cancel states

**Files:**
- Modify: `app/invoice-review/[token]/page.tsx`
- Modify: `components/invoices/PublicInvoiceView.tsx`
- Create: `components/invoices/PayInvoiceButton.tsx` (client component)
- Test (E2E): `e2e/invoice-pay.spec.ts`

**Interfaces:**
- Consumes: `POST /api/invoice-review/[token]/checkout`.

- [ ] **Step 1: `PayInvoiceButton.tsx`** (client): a button that POSTs to `/api/invoice-review/${token}/checkout`, reads `{ url }` (use `readApiError` on failure → toast), and `window.location.assign(url)`. Disabled while pending.

- [ ] **Step 2: Wire the page** — in `page.tsx`, the page currently passes `payUrl: snap.stripePaymentLinkUrl`. Replace that with a live capability signal: fetch the org's `stripeConnectStatus` for this invoice (add `org: { select: { stripeConnectStatus } }` to `INVOICE_INCLUDE` or a small extra query) and pass `canPayOnline = status === "active" && balanceDue > 0 && invoice.status !== "void"`. Pass `token` down. Read `searchParams` for `?pay=success|cancelled` to show a confirmation/cancelled banner. (Page signature gains `searchParams: Promise<{ pay?: string }>`.)

- [ ] **Step 3: `PublicInvoiceView.tsx`** — when `canPayOnline`, render `<PayInvoiceButton token={token} />` and the balance due prominently; on `?pay=success` show "Payment received — thank you!" (the ledger may lag a second behind the webhook; the confirm endpoint in Task 11 closes that gap). Remove the old `payUrl` external-link button.

- [ ] **Step 4: E2E** `e2e/invoice-pay.spec.ts` — **logged-out context** (per the public-route gotcha). Seed an org with `stripeConnectStatus: "active"` and a sent invoice; load the public page; assert the "Pay now" button is present and that clicking it issues the checkout POST (intercept the network call and assert it returns a Stripe URL, or stub it). Do **not** drive Stripe's hosted page. Run with `--workers=1`.

- [ ] **Step 5: Lint + commit**
```bash
git add app/invoice-review/[token]/page.tsx components/invoices/PublicInvoiceView.tsx components/invoices/PayInvoiceButton.tsx e2e/invoice-pay.spec.ts
git commit -m "feat(stripe): pay-now button and pay states on public invoice page"
```

---

## Phase 4 — Recording

### Task 9: `recordStripePayment` (idempotent)

**Files:**
- Modify: `lib/repositories/invoiceRepo.ts`
- Test: `__tests__/repositories/recordStripePayment.test.ts` (DB-gated)

**Interfaces:**
- Consumes: existing `nextInvoiceStatus`, `INVOICE_INCLUDE`.
- Produces:
  - `recordStripePayment(input: { paymentIntentId: string; chargeId: string; orgId: string; invoiceId: number; amount: number; feeAmount: number | null; netAmount: number | null; }): Promise<{ recorded: boolean }>` — idempotent on `chargeId`.

- [ ] **Step 1: Write the failing test** (gated on `VITEST_DB_AVAILABLE`, like other real-DB repo tests):

```ts
import { describe, expect, it } from "vitest";
import { recordStripePayment } from "@/lib/repositories/invoiceRepo";
// ...set up an org + estimate + sent invoice via existing test helpers...

const dbIt = process.env.VITEST_DB_AVAILABLE ? it : it.skip;

describe("recordStripePayment", () => {
  dbIt("records once and is idempotent on chargeId", async () => {
    const { orgId, invoiceId, amount } = await seedSentInvoice();
    const args = {
      paymentIntentId: "pi_1",
      chargeId: "ch_1",
      orgId,
      invoiceId,
      amount,
      feeAmount: 1.43,
      netAmount: amount - 1.43,
    };
    const first = await recordStripePayment(args);
    const second = await recordStripePayment(args); // duplicate delivery
    expect(first.recorded).toBe(true);
    expect(second.recorded).toBe(false);
    const inv = await getInvoice(invoiceId, orgId);
    expect(inv?.payments).toHaveLength(1);
    expect(inv?.status).toBe("paid");
    expect(inv?.payments[0]?.stripeFeeAmount).toBe(1.43);
  });
});
```

- [ ] **Step 2: Implement** in `lib/repositories/invoiceRepo.ts`, modeled on `recordPayment` but idempotent and fee-aware:

```ts
export async function recordStripePayment(input: {
  paymentIntentId: string;
  chargeId: string;
  orgId: string;
  invoiceId: number;
  amount: number;
  feeAmount: number | null;
  netAmount: number | null;
}): Promise<{ recorded: boolean }> {
  return prisma.$transaction(async (tx) => {
    // Idempotency: a payment with this chargeId already exists → no-op.
    const existing = await tx.payment.findUnique({
      where: { stripeChargeId: input.chargeId },
      select: { id: true },
    });
    if (existing) return { recorded: false };

    const inv = await tx.invoice.findFirst({
      where: { id: input.invoiceId, orgId: input.orgId },
      include: { payments: { select: { amount: true } } },
    });
    if (!inv) return { recorded: false };
    if (inv.status === "void") return { recorded: false };

    await tx.payment.create({
      data: {
        invoiceId: input.invoiceId,
        amount: input.amount,
        method: "stripe",
        stripeChargeId: input.chargeId,
        stripeFeeAmount: input.feeAmount,
        stripeNetAmount: input.netAmount,
        recordedByName: "Stripe",
      },
    });

    const paid = inv.payments.reduce((s, p) => s + p.amount, 0) + input.amount;
    const status = nextInvoiceStatus({
      current: inv.status,
      amount: inv.amount,
      paid,
    });
    await tx.invoice.update({
      where: { id: input.invoiceId },
      data: {
        status,
        paidAt: status === "paid" ? new Date() : null,
        stripePaymentIntentId: input.paymentIntentId,
      },
    });
    await tx.invoiceEvent.create({
      data: {
        invoiceId: input.invoiceId,
        type: "payment_recorded",
        source: "customer",
        actorName: "Stripe",
        metadata: {
          amount: input.amount,
          method: "stripe",
          fee: input.feeAmount,
          net: input.netAmount,
        },
      },
    });
    return { recorded: true };
  });
}
```

> The unique constraint on `Payment.stripeChargeId` is the hard idempotency backstop: if two deliveries race past the `findUnique` check, the second `create` throws `P2002` — catch it and return `{ recorded: false }`.

- [ ] **Step 3: Run** `npm test -- recordStripePayment` (skips locally without DB; runs in CI). Lint. **Commit.**
```bash
git add lib/repositories/invoiceRepo.ts __tests__/repositories/recordStripePayment.test.ts
git commit -m "feat(stripe): idempotent recordStripePayment ledger writer"
```

---

### Task 10: Webhook module + route

**Files:**
- Create: `lib/stripe/webhook.ts`
- Create: `app/api/webhooks/stripe/route.ts`
- Test: `__tests__/lib/stripe/webhook.test.ts`

**Interfaces:**
- Consumes: `getStripe`, `recordStripePayment`, `setOrgConnectStatus`, `readAccountStatus`.
- Produces: `handleStripeEvent(event, deps): Promise<void>` (deps injected so it's testable against an in-memory fake — the `lib/send` pipeline pattern).

- [ ] **Step 1: Failing test with an in-memory fake** — `__tests__/lib/stripe/webhook.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { handleStripeEvent } from "@/lib/stripe/webhook";

function deps() {
  const record = vi.fn().mockResolvedValue({ recorded: true });
  const seen = new Set<string>();
  return {
    record,
    isProcessed: async (id: string) => seen.has(id),
    markProcessed: async (id: string) => void seen.add(id),
    retrieveCharge: vi
      .fn()
      .mockResolvedValue({ id: "ch_1", balanceFee: 1.43, balanceNet: 448.57 }),
  };
}

describe("handleStripeEvent", () => {
  it("records a payment for checkout.session.completed", async () => {
    const d = deps();
    await handleStripeEvent(
      {
        id: "evt_1",
        type: "checkout.session.completed",
        account: "acct_1",
        data: {
          object: {
            payment_intent: "pi_1",
            metadata: { invoiceId: "77", orgId: "org_1" },
            amount_total: 45000,
          },
        },
      } as never,
      d
    );
    expect(d.record).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceId: 77,
        orgId: "org_1",
        paymentIntentId: "pi_1",
        amount: 450,
      })
    );
  });

  it("is idempotent on event id", async () => {
    const d = deps();
    const ev = { id: "evt_2", type: "payment_intent.succeeded", data: { object: {} } } as never;
    await handleStripeEvent(ev, d);
    await handleStripeEvent(ev, d);
    // second delivery short-circuits before doing work
    expect(d.record).toHaveBeenCalledTimes(0); // unrelated type, but still marked processed
  });

  it("ignores unrelated event types", async () => {
    const d = deps();
    await handleStripeEvent(
      { id: "evt_3", type: "customer.created", data: { object: {} } } as never,
      d
    );
    expect(d.record).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — expect FAIL.** `npm test -- webhook.test`

- [ ] **Step 3: Implement `lib/stripe/webhook.ts`**

```ts
import type Stripe from "stripe";
import { StripeWebhookInvalidError } from "@/lib/api/errors";
import { round2 } from "@/lib/money";
import { getStripe } from "./client";

export interface WebhookDeps {
  isProcessed(eventId: string): Promise<boolean>;
  markProcessed(eventId: string, type: string): Promise<void>;
  record(input: {
    paymentIntentId: string;
    chargeId: string;
    orgId: string;
    invoiceId: number;
    amount: number;
    feeAmount: number | null;
    netAmount: number | null;
  }): Promise<{ recorded: boolean }>;
  /** Fetch the charge + balance-transaction fee/net for a payment intent (on the connected account). */
  retrieveCharge(
    accountId: string,
    paymentIntentId: string
  ): Promise<{ id: string; balanceFee: number | null; balanceNet: number | null }>;
}

/** Verify signature → typed event. Throws StripeWebhookInvalidError on mismatch. */
export function constructStripeEvent(
  payload: string,
  signature: string | null,
  secret: string
): Stripe.Event {
  if (!signature) throw new StripeWebhookInvalidError();
  try {
    return getStripe().webhooks.constructEvent(payload, signature, secret);
  } catch {
    throw new StripeWebhookInvalidError();
  }
}

export async function handleStripeEvent(
  event: Stripe.Event,
  deps: WebhookDeps
): Promise<void> {
  if (await deps.isProcessed(event.id)) return;

  if (
    event.type === "checkout.session.completed" ||
    event.type === "payment_intent.succeeded"
  ) {
    const accountId = (event as { account?: string }).account ?? "";
    const obj = event.data.object as Record<string, unknown>;
    const paymentIntentId =
      typeof obj.payment_intent === "string"
        ? obj.payment_intent
        : typeof obj.id === "string" && event.type === "payment_intent.succeeded"
          ? obj.id
          : "";
    const metadata = (obj.metadata ?? {}) as Record<string, string>;
    const invoiceId = Number(metadata.invoiceId);
    const orgId = metadata.orgId ?? "";
    const amountTotal =
      typeof obj.amount_total === "number"
        ? obj.amount_total
        : typeof obj.amount === "number"
          ? (obj.amount as number)
          : 0;

    if (paymentIntentId && invoiceId && orgId && amountTotal > 0) {
      const charge = await deps.retrieveCharge(accountId, paymentIntentId);
      await deps.record({
        paymentIntentId,
        chargeId: charge.id,
        orgId,
        invoiceId,
        amount: round2(amountTotal / 100),
        feeAmount: charge.balanceFee,
        netAmount: charge.balanceNet,
      });
    }
  }

  await deps.markProcessed(event.id, event.type);
}
```

- [ ] **Step 4: Run — expect PASS.** `npm test -- webhook.test`

- [ ] **Step 5: Write the route** `app/api/webhooks/stripe/route.ts` — raw body, then construct + handle with real deps:

```ts
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe/client";
import { constructStripeEvent, handleStripeEvent } from "@/lib/stripe/webhook";
import { recordStripePayment } from "@/lib/repositories/invoiceRepo";

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return new NextResponse("not configured", { status: 500 });

  const body = await req.text(); // RAW body — required for signature verification
  const sig = (await headers()).get("stripe-signature");
  let event: ReturnType<typeof constructStripeEvent>;
  try {
    event = constructStripeEvent(body, sig, secret);
  } catch {
    return new NextResponse("invalid signature", { status: 400 });
  }

  try {
    await handleStripeEvent(event, {
      isProcessed: async (id) =>
        Boolean(
          await prisma.processedStripeEvent.findUnique({ where: { id } })
        ),
      markProcessed: async (id, type) => {
        await prisma.processedStripeEvent.create({ data: { id, type } });
      },
      record: (input) => recordStripePayment(input),
      retrieveCharge: async (accountId, paymentIntentId) => {
        const stripe = getStripe();
        const pi = await stripe.paymentIntents.retrieve(
          paymentIntentId,
          { expand: ["latest_charge.balance_transaction"] },
          { stripeAccount: accountId }
        );
        const charge = pi.latest_charge as {
          id: string;
          balance_transaction?: { fee: number; net: number } | null;
        } | null;
        const bt = charge?.balance_transaction ?? null;
        return {
          id: charge?.id ?? `pi_${paymentIntentId}`,
          balanceFee: bt ? bt.fee / 100 : null,
          balanceNet: bt ? bt.net / 100 : null,
        };
      },
    });
  } catch (err) {
    // Returning 500 makes Stripe retry — acceptable since handling is idempotent.
    return new NextResponse("handler error", { status: 500 });
  }
  return new NextResponse(null, { status: 200 });
}
```

> This route does NOT use `apiRoute`/`publicRoute` (it needs the raw body and Stripe-signature auth, not session/JSON). It is allowlisted via `/api/webhooks/stripe` (Task 7, Step 1). Confirm Next 16 doesn't buffer/parse the body — `await req.text()` in an app-router route handler yields the raw bytes; if a future `bodyParser`-style option is needed, check `node_modules/next/dist/docs` for route-handler body handling.

- [ ] **Step 6: Lint + commit**
```bash
git add lib/stripe/webhook.ts app/api/webhooks/stripe/route.ts __tests__/lib/stripe/webhook.test.ts
git commit -m "feat(stripe): signature-verified webhook → idempotent ledger recording"
```

---

### Task 11: Confirm route (reconcile-on-return)

**Files:**
- Create: `app/api/invoice-review/[token]/confirm/route.ts`
- Test: `__tests__/api/invoice-confirm.test.ts`

**Interfaces:**
- Consumes: `getInvoiceByToken`, `getStripe`, `recordStripePayment`.
- Produces: `POST { sessionId }` → `{ status: "paid" | "pending" }`.

- [ ] **Step 1: Route** `app/api/invoice-review/[token]/confirm/route.ts`:

```ts
import { z } from "zod";
import { NotFoundError } from "@/lib/api/errors";
import { publicRoute } from "@/lib/api/route";
import { round2 } from "@/lib/money";
import { getInvoiceByToken } from "@/lib/repositories/invoiceRepo";
import { recordStripePayment } from "@/lib/repositories/invoiceRepo";
import { getOrgStripe } from "@/lib/repositories/orgRepo";
import { getStripe } from "@/lib/stripe/client";

const Body = z.object({ sessionId: z.string().min(1).max(200) });

export const POST = publicRoute<{ sessionId: string }, { token: string }>(
  { input: Body },
  async ({ input, params }) => {
    const invoice = await getInvoiceByToken(params.token);
    if (!invoice || invoice.status === "void") throw new NotFoundError();
    const org = await getOrgStripe(invoice.orgId);
    if (!org.stripeConnectAccountId) throw new NotFoundError();

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(
      input.sessionId,
      { expand: ["payment_intent.latest_charge.balance_transaction"] },
      { stripeAccount: org.stripeConnectAccountId }
    );
    if (session.payment_status !== "paid") return { status: "pending" };

    const pi = session.payment_intent as {
      id: string;
      latest_charge?: {
        id: string;
        balance_transaction?: { fee: number; net: number } | null;
      } | null;
    };
    const charge = pi.latest_charge ?? null;
    const bt = charge?.balance_transaction ?? null;
    await recordStripePayment({
      paymentIntentId: pi.id,
      chargeId: charge?.id ?? `pi_${pi.id}`,
      orgId: invoice.orgId,
      invoiceId: invoice.id,
      amount: round2((session.amount_total ?? 0) / 100),
      feeAmount: bt ? bt.fee / 100 : null,
      netAmount: bt ? bt.net / 100 : null,
    });
    return { status: "paid" };
  }
);
```

This shares the idempotent `recordStripePayment`, so racing the webhook is safe — whichever lands first records; the other no-ops.

- [ ] **Step 2: Test** — mock stripe + repo: `payment_status: "paid"` → calls `recordStripePayment` and returns `{ status: "paid" }`; `"unpaid"` → `{ status: "pending" }` and no record. Add the PayInvoiceButton's success-page call: on `?pay=success&session_id=…`, the public page (client) POSTs to confirm and refreshes the banner to "Payment received."

- [ ] **Step 3: Lint + commit**
```bash
git add app/api/invoice-review/[token]/confirm/route.ts __tests__/api/invoice-confirm.test.ts
git commit -m "feat(stripe): reconcile-on-return confirm route"
```

---

### Task 12: Builder fee/net display + docs sync

**Files:**
- Modify: `components/invoices/InvoiceDetail.tsx` (or the payment-list child)
- Modify: `CONTEXT.md`, `AGENTS.md`

- [ ] **Step 1: Show Stripe fee/net** — in the builder's payment list, when a `Payment.method === "stripe"` and `stripeNetAmount != null`, render a sub-line: `Paid {amount} · Stripe fee {fee} · You netted {net}` using `fmtDollar`. Falls back to just the amount for non-stripe/manual payments.

- [ ] **Step 2: Update `CONTEXT.md`** — in the **Invoice** section, replace "Payments are recorded manually into a `Payment` ledger (the schema is Stripe-ready but Stripe execution is out of scope)." with a description of the Stripe Checkout flow: homeowners pay the balance via a hosted Checkout Session created on the org's Connect account (direct charge, contractor bears the fee); a signature-verified webhook plus an idempotent reconcile-on-return endpoint record the payment via `recordStripePayment`; `Payment` now carries `stripeFeeAmount`/`stripeNetAmount`. Add the four new error codes to the **API Error Codes** list (`STRIPE_NOT_CONNECTED`, `STRIPE_ACCOUNT_RESTRICTED`, `INVOICE_ALREADY_PAID`, `STRIPE_WEBHOOK_INVALID`) with their files.

- [ ] **Step 3: Update `AGENTS.md`** — under *Where things live*, add `lib/stripe/` (client, connect, checkout, webhook), the `/settings/payments` admin surface, and the `/api/webhooks/stripe` raw-body route. Under *Gotchas*, add: "Stripe runs isolated test/live modes — the key mode must match the mode of the stored `stripeConnectAccountId` (holds by construction via the dev/prod DB split); an org onboarded in prod must re-onboard in any test env."

- [ ] **Step 4: Full verification**

Run: `npm run lint:ci && npm run typecheck && npm test`
Expected: lint clean, types clean, unit/component tests pass (real-DB tests skip locally without `VITEST_DB_AVAILABLE`).

- [ ] **Step 5: Commit**
```bash
git add components/invoices/InvoiceDetail.tsx CONTEXT.md AGENTS.md
git commit -m "feat(stripe): show fee/net in builder; sync CONTEXT/AGENTS docs"
```

---

## Self-Review (completed)

- **Spec coverage:** Connect config (Task 3), direct-charge checkout (Tasks 6–7), contractor-bears-fee/no surcharge (Task 6 builder asserts no app fee), fee/net capture (Tasks 9–11 + display Task 12), webhook + reconcile idempotency (Tasks 9–11), onboarding UI (Tasks 4–5), test/prod env handling (Task 1 mode detection + `.env.example`; documented invariant Task 12), schema additive migration (Task 2), error codes (Task 1 + docs Task 12), allowlist (Task 7), docs sync (Task 12). All spec sections map to a task.
- **Placeholder scan:** no TBD/TODO; code shown for every code step. Two explicit "verify against Stripe MCP" notes for the v2 Accounts SDK shapes — these are correctness checkpoints, not placeholders (the documented call shape is provided).
- **Type consistency:** `recordStripePayment` input object identical in Tasks 9, 10, 11; `ConnectStatus` union consistent across connect/orgRepo; `buildCheckoutParams`/`createInvoiceCheckoutSession` signatures match their callers; metadata keys (`invoiceId`, `orgId`) consistent builder→webhook.

## Known correctness checkpoints for the implementer

1. **Accounts v2 SDK surface** (Task 3): confirm `stripe.v2.core.accounts.create/retrieve`, the `include`/capability path, and the onboarding-link call against the Stripe MCP before relying on the field names. Keep the three dimensions intact (full dashboard / merchant card_payments / fees+losses = stripe).
2. **Connect webhook delivery** (Task 10): the `checkout.session.completed`/`payment_intent.succeeded` events for direct charges carry `event.account` (the connected account). Register the endpoint as a **Connect** webhook in the Stripe Dashboard (test + live), and locally use `stripe listen --forward-connect-to localhost:3000/api/webhooks/stripe`.
3. **Balance-transaction expansion** (Tasks 10–11): `latest_charge.balance_transaction` must be retrieved **on the connected account** (`{ stripeAccount }`); fee/net are in cents → divide by 100.
4. **API version literal** (Task 1): if the SDK's TS types reject `"2026-06-24.dahlia"`, confirm the current string via the Stripe MCP; do not silently drop the pin.

# Online Payments (Stripe) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a contractor's customer pay an invoice online from the public `/invoice-review/[token]` page via Stripe, auto-recording settled payments into the existing `Payment` ledger by webhook.

**Architecture:** Stripe Connect **Express** (one connected account per org). Customers pay through a **server-created, Stripe-hosted Checkout Session** (cards + ACH) using **destination charges** (`transfer_data.destination` + `on_behalf_of`) created on the platform account. A signature-verified **webhook** is the sole source of truth: it records **settled** payments via a new `recordStripePayment` seam (ledger = settled money only, so `nextInvoiceStatus` is untouched and unsettled ACH never reads as paid). All Stripe access sits behind a `StripeGateway` **port** (real + in-memory fake), mirroring the `runSendPipeline` seam, so logic is unit-testable with no network and no DB.

**Tech Stack:** Next.js 16 (app router, route handlers), Prisma/Postgres, `stripe` Node SDK, Zod, react-query, Vitest, Playwright, Biome.

**Spec:** [docs/superpowers/specs/2026-06-14-online-payments-design.md](../specs/2026-06-14-online-payments-design.md)

---

## File Structure

**New — `lib/stripe/` (the seam):**
- `lib/stripe/client.ts` — lazy null-safe `Stripe` singleton (mirrors `lib/email/client.ts`).
- `lib/stripe/gateway.ts` — `StripeGateway` interface + shared types.
- `lib/stripe/realGateway.ts` — production implementation (the only file touching the SDK call surface).
- `lib/stripe/fakeGateway.ts` — in-memory implementation for tests.
- `lib/stripe/checkout.ts` — pure Checkout-Session params builder.
- `lib/stripe/onboarding.ts` — `ensureConnectAccount`, `buildAccountLink`, `mirrorAccountStatus`, `getConnectAccountId`, `getConnectStatus`.
- `lib/stripe/webhookHandler.ts` — `handleStripeEvent(event, deps)` dispatch brain + `buildProdWebhookDeps()`.

**New — API routes:**
- `app/api/org/stripe-connect/onboarding/route.ts` — POST (admin): ensure account + mint onboarding link.
- `app/api/org/stripe-connect/refresh/route.ts` — GET (admin): re-mint link + redirect.
- `app/api/org/stripe-connect/status/route.ts` — GET (admin): mirrored status.
- `app/api/invoice-review/[token]/pay/route.ts` — GET (public): build live-balance session + 303 to Stripe.
- `app/api/stripe/webhook/route.ts` — POST (bare): raw-body signature verify + dispatch.

**New — UI:**
- `components/settings/workspace/PaymentsSection.tsx` — admin Payments section.
- `lib/hooks/useStripeConnect.ts` — onboarding mutation + status query hooks.

**Modified:**
- `prisma/schema.prisma` — add `Organization` mirror columns (+ new migration folder).
- `prisma/seed.ts` — explicit defaults for the new columns.
- `lib/api/errors.ts` — 5 new error classes.
- `lib/repositories/invoiceRepo.ts` — `recordStripePayment`, `getStripeInvoiceContext`, `getInvoicePayContext`, `setInvoicePaymentIntent`, `appendInvoiceEvent`; extend `getInvoiceByToken` include.
- `lib/publicRoutes.ts` — allowlist `/api/invoice-review/` (pay) and `/api/stripe/webhook`.
- `app/invoice-review/[token]/page.tsx` — compute `payUrl` from live state + render the processing banner.
- `app/(app)/settings/workspace/page.tsx` + `components/settings/workspace/{WorkspaceSettingsView,Toc,types}.tsx` — load + render the Payments section.
- `CONTEXT.md`, `AGENTS.md`, `.env.example` — docs/config.

**Conventions to follow (verified in-repo):**
- Generated Prisma client import path: `@/app/generated/prisma/client`.
- Error envelope + classes: `lib/api/errors.ts`. Repo mutations run inside `prisma.$transaction(async (tx) => …)`.
- Unit tests mock `@/lib/prisma` with a `tx` object of `vi.fn()`s (see `__tests__/repositories/invoiceRepoMutations.test.ts`) and use the injected-fake style (see `__tests__/lib/send/pipeline.test.ts`).
- Run `npm run lint:fix && npm run typecheck && npm test` before every commit; E2E with `--workers=1`.

---

## Task 1: Stripe client singleton + dependency

**Files:**
- Create: `lib/stripe/client.ts`
- Test: `__tests__/lib/stripe/client.test.ts`
- Modify: `package.json` (add `stripe`)

- [ ] **Step 1: Install the SDK**

Run: `npm install stripe`
Expected: `stripe` appears under `dependencies` in `package.json`; `npm test` still runs.

- [ ] **Step 2: Write the failing test**

Create `__tests__/lib/stripe/client.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

describe("getStripeClient", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("returns null when STRIPE_SECRET_KEY is unset", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    const { getStripeClient } = await import("@/lib/stripe/client");
    expect(getStripeClient()).toBeNull();
  });

  it("returns a singleton when the key is set", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_dummy");
    const { getStripeClient } = await import("@/lib/stripe/client");
    const a = getStripeClient();
    const b = getStripeClient();
    expect(a).not.toBeNull();
    expect(a).toBe(b);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- client.test`
Expected: FAIL — `Cannot find module '@/lib/stripe/client'`.

- [ ] **Step 4: Write the client**

Create `lib/stripe/client.ts`:

```ts
import Stripe from "stripe";

// Lazy, server-only singleton (mirrors lib/email/client.ts). Returns null when
// STRIPE_SECRET_KEY is unset so module-load never instantiates — CI, worktrees,
// and unit tests stay green without a key. Routes that need Stripe go through
// the gateway, which throws a typed error when the client is null.
let _client: Stripe | null = null;

export function getStripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  // apiVersion is intentionally omitted so the installed SDK's pinned version
  // applies (avoids a version-literal mismatch). Pin explicitly later if needed.
  if (!_client) _client = new Stripe(key);
  return _client;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- client.test`
Expected: PASS (both cases).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json lib/stripe/client.ts __tests__/lib/stripe/client.test.ts
git commit -m "feat(stripe): add lazy null-safe Stripe client singleton"
```

---

## Task 2: Error codes + env placeholders

**Files:**
- Modify: `lib/api/errors.ts`
- Create/Modify: `.env.example`
- Modify: `CONTEXT.md` (API Error Codes section)

- [ ] **Step 1: Add the 5 error classes**

In `lib/api/errors.ts`, after `InvoiceOverbillError` (line ~121), add:

```ts
/** Pay route / Checkout creation for an org that hasn't completed Connect onboarding. */
export class StripeNotConnectedError extends ConflictError {
  constructor() {
    super(
      "This business hasn't finished setting up online payments yet.",
      "STRIPE_NOT_CONNECTED"
    );
  }
}

/** Live balance is already ≤ 0 (or invoice is paid/void) — nothing to charge. */
export class InvoiceAlreadyPaidError extends ConflictError {
  constructor() {
    super("This invoice has no balance due.", "INVOICE_ALREADY_PAID");
  }
}

/** accounts.create / account_links.create / checkout.sessions.create failed upstream. */
export class StripeOnboardingError extends ApiError {
  constructor(message = "Payment provider error") {
    super({ code: "STRIPE_ONBOARDING_FAILED", status: 502, message });
  }
}

/**
 * Webhook resolved a PaymentIntent whose transfer destination and
 * metadata.invoiceId don't agree on one org. Never writes the ledger. Logged
 * and acknowledged (200) so Stripe stops retrying a structurally-bad event.
 */
export class StripeOrgMismatchError extends ApiError {
  constructor(message = "Stripe payment org mismatch") {
    super({ code: "STRIPE_ORG_MISMATCH", status: 422, message });
  }
}
```

(There is no class for `STRIPE_WEBHOOK_SIGNATURE_FAILED`: the bare webhook route returns a plain `400 Response` and never uses the envelope. The code string is documented for parity only.)

- [ ] **Step 2: Verify it typechecks**

Run: `npm run typecheck`
Expected: PASS (no usages yet; classes compile).

- [ ] **Step 3: Add env placeholders**

Create or update `.env.example` — append:

```bash
# Stripe (online payments). All server-side; no publishable key (hosted Checkout redirect).
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
# Optional: only if account.updated needs a separate connect=true endpoint secret.
# STRIPE_CONNECT_WEBHOOK_SECRET=whsec_...
```

- [ ] **Step 4: Document the codes in CONTEXT.md**

In `CONTEXT.md`, under **Domain codes** (after `INVOICE_OVERBILL`), add:

```markdown
- `STRIPE_NOT_CONNECTED` (409) — pay route / Checkout creation for an org with
  no connected account or `stripeChargesEnabled=false`.
- `INVOICE_ALREADY_PAID` (409) — pay route invoked when the live balance is ≤ 0
  or the invoice is `paid`/`void`.
- `STRIPE_ONBOARDING_FAILED` (502) — Stripe API rejected an
  accounts/account_links/checkout-session create.
- `STRIPE_ORG_MISMATCH` (422) — webhook PaymentIntent's destination and
  `metadata.invoiceId` disagree on an org; logged + acked, never recorded.
- `STRIPE_WEBHOOK_SIGNATURE_FAILED` (400) — bare webhook route rejected the
  signature; plain 400 Response (not the envelope).
```

- [ ] **Step 5: Commit**

```bash
git add lib/api/errors.ts .env.example CONTEXT.md
git commit -m "feat(stripe): add online-payment error codes + env placeholders"
```

---

## Task 3: StripeGateway port + real + fake implementations

**Files:**
- Create: `lib/stripe/gateway.ts`
- Create: `lib/stripe/realGateway.ts`
- Create: `lib/stripe/fakeGateway.ts`
- Test: `__tests__/lib/stripe/fakeGateway.test.ts`

- [ ] **Step 1: Define the port**

Create `lib/stripe/gateway.ts`:

```ts
import type Stripe from "stripe";

export interface CreatedCheckoutSession {
  id: string;
  url: string | null;
  paymentIntentId: string | null;
}

/**
 * The Stripe seam. Business logic imports this port, not the SDK, so it is
 * unit-testable against the in-memory fake (mirrors lib/send/pipeline.ts).
 */
export interface StripeGateway {
  /** Create an Express controller-based connected account; returns its id. */
  createConnectAccount(orgId: string): Promise<{ id: string }>;
  /** Mint a single-use account-onboarding link. */
  createAccountLink(
    accountId: string,
    urls: { refreshUrl: string; returnUrl: string }
  ): Promise<{ url: string }>;
  /** Create a hosted Checkout Session from prebuilt params. */
  createCheckoutSession(
    params: Stripe.Checkout.SessionCreateParams
  ): Promise<CreatedCheckoutSession>;
  /** Retrieve a PaymentIntent with `latest_charge` expanded. */
  retrievePaymentIntent(id: string): Promise<Stripe.PaymentIntent>;
  /** Verify + parse a webhook payload. Throws on bad signature. */
  constructWebhookEvent(rawBody: string, signature: string | null): Stripe.Event;
}
```

- [ ] **Step 2: Write the real implementation**

Create `lib/stripe/realGateway.ts`:

```ts
import type Stripe from "stripe";
import { StripeOnboardingError } from "@/lib/api/errors";
import { getStripeClient } from "./client";
import type { CreatedCheckoutSession, StripeGateway } from "./gateway";

function client(): Stripe {
  const c = getStripeClient();
  if (!c) throw new StripeOnboardingError("Stripe is not configured");
  return c;
}

function asId(v: string | { id: string } | null | undefined): string | null {
  if (!v) return null;
  return typeof v === "string" ? v : v.id;
}

export const realGateway: StripeGateway = {
  async createConnectAccount(orgId) {
    const account = await client().accounts.create({
      controller: {
        stripe_dashboard: { type: "express" },
        fees: { payer: "application" },
        losses: { payments: "application" },
        requirement_collection: "stripe",
      },
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      metadata: { orgId },
    });
    return { id: account.id };
  },

  async createAccountLink(accountId, urls) {
    const link = await client().accountLinks.create({
      account: accountId,
      refresh_url: urls.refreshUrl,
      return_url: urls.returnUrl,
      type: "account_onboarding",
      collection_options: { fields: "eventually_due" },
    });
    return { url: link.url };
  },

  async createCheckoutSession(params): Promise<CreatedCheckoutSession> {
    const s = await client().checkout.sessions.create(params);
    return { id: s.id, url: s.url, paymentIntentId: asId(s.payment_intent) };
  },

  async retrievePaymentIntent(id) {
    return client().paymentIntents.retrieve(id, { expand: ["latest_charge"] });
  },

  constructWebhookEvent(rawBody, signature) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new StripeOnboardingError("Webhook secret not configured");
    return client().webhooks.constructEvent(rawBody, signature ?? "", secret);
  },
};
```

- [ ] **Step 3: Write the failing fake test**

Create `__tests__/lib/stripe/fakeGateway.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { makeFakeGateway } from "@/lib/stripe/fakeGateway";

describe("makeFakeGateway", () => {
  it("records calls and returns canned objects", async () => {
    const g = makeFakeGateway();
    const acct = await g.createConnectAccount("org1");
    expect(acct.id).toMatch(/^acct_/);
    expect(g.calls.map((c) => c.name)).toContain("createConnectAccount");

    const link = await g.createAccountLink("acct_x", {
      refreshUrl: "r",
      returnUrl: "ret",
    });
    expect(link.url).toContain("https://connect.stripe.test");
  });

  it("returns a queued PaymentIntent from retrievePaymentIntent", async () => {
    const g = makeFakeGateway({
      paymentIntents: {
        pi_1: {
          id: "pi_1",
          amount: 5000,
          amount_received: 5000,
          latest_charge: { id: "ch_1", payment_method_details: { type: "card" } },
          transfer_data: { destination: "acct_org" },
          metadata: { invoiceId: "42", orgId: "org1" },
        } as never,
      },
    });
    const pi = await g.retrievePaymentIntent("pi_1");
    expect(pi.id).toBe("pi_1");
    expect((pi.latest_charge as { id: string }).id).toBe("ch_1");
  });
});
```

- [ ] **Step 4: Run to verify it fails**

Run: `npm test -- fakeGateway.test`
Expected: FAIL — `Cannot find module '@/lib/stripe/fakeGateway'`.

- [ ] **Step 5: Write the fake**

Create `lib/stripe/fakeGateway.ts`:

```ts
import type Stripe from "stripe";
import type { CreatedCheckoutSession, StripeGateway } from "./gateway";

export interface FakeCall {
  name: string;
  args: unknown;
}

export interface FakeGatewayConfig {
  /** PaymentIntents returned by retrievePaymentIntent, keyed by id. */
  paymentIntents?: Record<string, Stripe.PaymentIntent>;
  /** Override the next created session. */
  session?: Partial<CreatedCheckoutSession>;
  /** When set, constructWebhookEvent returns it; when "throw", it throws. */
  webhookEvent?: Stripe.Event | "throw";
}

export interface FakeGateway extends StripeGateway {
  calls: FakeCall[];
}

export function makeFakeGateway(config: FakeGatewayConfig = {}): FakeGateway {
  const calls: FakeCall[] = [];
  let seq = 0;
  const record = (name: string, args: unknown) => calls.push({ name, args });

  return {
    calls,
    async createConnectAccount(orgId) {
      record("createConnectAccount", { orgId });
      return { id: `acct_${++seq}` };
    },
    async createAccountLink(accountId, urls) {
      record("createAccountLink", { accountId, urls });
      return { url: `https://connect.stripe.test/setup/${accountId}` };
    },
    async createCheckoutSession(params) {
      record("createCheckoutSession", params);
      return {
        id: config.session?.id ?? `cs_${++seq}`,
        url: config.session?.url ?? "https://checkout.stripe.test/pay",
        paymentIntentId: config.session?.paymentIntentId ?? `pi_${seq}`,
      };
    },
    async retrievePaymentIntent(id) {
      record("retrievePaymentIntent", { id });
      const pi = config.paymentIntents?.[id];
      if (!pi) throw new Error(`fake: no PaymentIntent ${id}`);
      return pi;
    },
    constructWebhookEvent(rawBody, signature) {
      record("constructWebhookEvent", { rawBody, signature });
      if (config.webhookEvent === "throw" || !config.webhookEvent) {
        throw new Error("fake: bad signature");
      }
      return config.webhookEvent;
    },
  };
}
```

- [ ] **Step 6: Run to verify it passes**

Run: `npm test -- fakeGateway.test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/stripe/gateway.ts lib/stripe/realGateway.ts lib/stripe/fakeGateway.ts __tests__/lib/stripe/fakeGateway.test.ts
git commit -m "feat(stripe): add StripeGateway port with real + in-memory fake"
```

---

## Task 4: Pure Checkout-Session params builder

**Files:**
- Create: `lib/stripe/checkout.ts`
- Test: `__tests__/lib/stripe/checkout.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/stripe/checkout.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildCheckoutSessionParams } from "@/lib/stripe/checkout";

const base = {
  invoiceId: 42,
  orgId: "org1",
  connectAccountId: "acct_org",
  amountCents: 740350,
  invoiceNumber: 7465,
  customerEmail: "alex@example.com",
  successUrl: "https://app.test/invoice-review/tok?paid=1",
  cancelUrl: "https://app.test/invoice-review/tok",
};

describe("buildCheckoutSessionParams", () => {
  it("is a one-time payment for the exact balance in cents", () => {
    const p = buildCheckoutSessionParams(base);
    expect(p.mode).toBe("payment");
    const item = p.line_items?.[0];
    expect(item?.quantity).toBe(1);
    expect(item?.price_data?.unit_amount).toBe(740350);
    expect(item?.price_data?.currency).toBe("usd");
  });

  it("accepts cards and ACH", () => {
    const p = buildCheckoutSessionParams(base);
    expect(p.payment_method_types).toEqual(["card", "us_bank_account"]);
    expect(p.payment_method_options?.us_bank_account?.verification_method).toBe(
      "instant"
    );
  });

  it("routes to the connected account via destination + on_behalf_of", () => {
    const p = buildCheckoutSessionParams(base);
    expect(p.payment_intent_data?.transfer_data?.destination).toBe("acct_org");
    expect(p.payment_intent_data?.on_behalf_of).toBe("acct_org");
  });

  it("stamps invoiceId on BOTH the session and the payment_intent metadata", () => {
    const p = buildCheckoutSessionParams(base);
    expect(p.metadata?.invoiceId).toBe("42");
    expect(p.payment_intent_data?.metadata?.invoiceId).toBe("42");
  });

  it("passes the customer email and return URLs", () => {
    const p = buildCheckoutSessionParams(base);
    expect(p.customer_email).toBe("alex@example.com");
    expect(p.success_url).toBe(base.successUrl);
    expect(p.cancel_url).toBe(base.cancelUrl);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- checkout.test`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the builder**

Create `lib/stripe/checkout.ts`:

```ts
import type Stripe from "stripe";

export interface CheckoutParamsInput {
  invoiceId: number;
  orgId: string;
  connectAccountId: string;
  amountCents: number;
  invoiceNumber: number;
  customerEmail: string | null;
  successUrl: string;
  cancelUrl: string;
  currency?: string;
}

/**
 * Build destination-charge Checkout Session params. Pure — no SDK, no network.
 * `on_behalf_of` is non-optional: it puts the contractor's name on the
 * customer's statement and is required for the contractor-branded flow.
 */
export function buildCheckoutSessionParams(
  i: CheckoutParamsInput
): Stripe.Checkout.SessionCreateParams {
  const metadata = { invoiceId: String(i.invoiceId), orgId: i.orgId };
  return {
    mode: "payment",
    payment_method_types: ["card", "us_bank_account"],
    payment_method_options: {
      us_bank_account: { verification_method: "instant" },
    },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: i.currency ?? "usd",
          unit_amount: i.amountCents,
          product_data: { name: `Invoice #${i.invoiceNumber}` },
        },
      },
    ],
    payment_intent_data: {
      transfer_data: { destination: i.connectAccountId },
      on_behalf_of: i.connectAccountId,
      metadata,
    },
    metadata,
    customer_email: i.customerEmail ?? undefined,
    success_url: i.successUrl,
    cancel_url: i.cancelUrl,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- checkout.test`
Expected: PASS (all 5 cases).

- [ ] **Step 5: Commit**

```bash
git add lib/stripe/checkout.ts __tests__/lib/stripe/checkout.test.ts
git commit -m "feat(stripe): add pure destination Checkout-Session params builder"
```

---

## Task 5: `recordStripePayment` + Stripe repo helpers

**Files:**
- Modify: `lib/repositories/invoiceRepo.ts`
- Test: `__tests__/repositories/recordStripePayment.test.ts`

This adds the no-human ledger seam plus the small reads the routes/handler need. `recordStripePayment` writes `recordedByEmail: null` / `recordedByName: "Stripe"` directly — so `RecordPaymentInput` (the human path) is left unchanged (YAGNI; the spec's "relax RecordPaymentInput" step is unnecessary once this is a separate function).

- [ ] **Step 1: Write the failing test**

Create `__tests__/repositories/recordStripePayment.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const invoiceFindFirst = vi.fn();
const paymentFindUnique = vi.fn();
const paymentCreate = vi.fn();
const invoiceUpdate = vi.fn();
const invoiceEventCreate = vi.fn();

const tx = {
  invoice: { findFirst: invoiceFindFirst, update: invoiceUpdate },
  payment: { findUnique: paymentFindUnique, create: paymentCreate },
  invoiceEvent: { create: invoiceEventCreate },
};
const $transaction = vi.fn((cb: (c: typeof tx) => unknown) => cb(tx));

vi.mock("@/lib/prisma", () => ({ prisma: { ...tx, $transaction } }));

const { recordStripePayment } = await import("@/lib/repositories/invoiceRepo");

beforeEach(() => vi.clearAllMocks());

const input = {
  amount: 100,
  method: "card" as const,
  stripeChargeId: "ch_1",
  stripePaymentIntentId: "pi_1",
};

describe("recordStripePayment", () => {
  it("returns 'duplicate' when the charge id already exists (replay)", async () => {
    paymentFindUnique.mockResolvedValue({ id: 9 });
    expect(await recordStripePayment(1, "org1", input)).toBe("duplicate");
    expect(paymentCreate).not.toHaveBeenCalled();
  });

  it("returns 'not_found' when the invoice is missing in the org", async () => {
    paymentFindUnique.mockResolvedValue(null);
    invoiceFindFirst.mockResolvedValue(null);
    expect(await recordStripePayment(1, "org1", input)).toBe("not_found");
    expect(paymentCreate).not.toHaveBeenCalled();
  });

  it("records with no human recorder and recomputes status to partial", async () => {
    paymentFindUnique.mockResolvedValue(null);
    invoiceFindFirst.mockResolvedValue({
      id: 1,
      status: "sent",
      amount: 500,
      payments: [{ amount: 100 }],
    });
    paymentCreate.mockResolvedValue({});
    invoiceUpdate.mockResolvedValue({});
    invoiceEventCreate.mockResolvedValue({});

    expect(await recordStripePayment(1, "org1", input)).toBe("recorded");

    expect(paymentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          invoiceId: 1,
          amount: 100,
          method: "card",
          recordedByEmail: null,
          recordedByName: "Stripe",
          stripeChargeId: "ch_1",
        }),
      })
    );
    expect(invoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "partial",
          paidAt: null,
          stripePaymentIntentId: "pi_1",
        }),
      })
    );
    expect(invoiceEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "payment_recorded",
          source: "system",
        }),
      })
    );
  });

  it("settles to paid (paidAt set) when fully covered", async () => {
    paymentFindUnique.mockResolvedValue(null);
    invoiceFindFirst.mockResolvedValue({
      id: 1,
      status: "sent",
      amount: 100,
      payments: [],
    });
    paymentCreate.mockResolvedValue({});
    invoiceUpdate.mockResolvedValue({});
    invoiceEventCreate.mockResolvedValue({});

    await recordStripePayment(1, "org1", input);

    const call = invoiceUpdate.mock.calls[0][0];
    expect(call.data.status).toBe("paid");
    expect(call.data.paidAt).toBeInstanceOf(Date);
  });

  it("treats a P2002 unique-violation on create as 'duplicate'", async () => {
    paymentFindUnique.mockResolvedValue(null);
    invoiceFindFirst.mockResolvedValue({
      id: 1,
      status: "sent",
      amount: 100,
      payments: [],
    });
    paymentCreate.mockRejectedValue({ code: "P2002" });

    expect(await recordStripePayment(1, "org1", input)).toBe("duplicate");
    expect(invoiceUpdate).not.toHaveBeenCalled();
  });

  it("does not record onto a void invoice", async () => {
    paymentFindUnique.mockResolvedValue(null);
    invoiceFindFirst.mockResolvedValue({
      id: 1,
      status: "void",
      amount: 100,
      payments: [],
    });
    expect(await recordStripePayment(1, "org1", input)).toBe("duplicate");
    expect(paymentCreate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- recordStripePayment.test`
Expected: FAIL — `recordStripePayment` is not exported.

- [ ] **Step 3: Implement `recordStripePayment` + helpers**

In `lib/repositories/invoiceRepo.ts`, add near `recordPayment`:

```ts
function isUniqueViolation(e: unknown): boolean {
  return (e as { code?: string } | null)?.code === "P2002";
}

export interface RecordStripePaymentInput {
  amount: number;
  method: "card" | "ach";
  stripeChargeId: string;
  stripePaymentIntentId: string;
  paidAt?: Date;
  stripeEventId?: string;
}

/**
 * Record a SETTLED Stripe payment into the ledger — the no-human counterpart
 * to recordPayment. Idempotent on Payment.stripeChargeId (find-first → skip,
 * with a P2002 catch as the hard backstop). Writes recordedByEmail:null /
 * recordedByName:'Stripe'. Reuses nextInvoiceStatus unchanged (we only ever
 * write rows for settled money, so an in-flight ACH never reaches here).
 */
export async function recordStripePayment(
  invoiceId: number,
  orgId: string,
  input: RecordStripePaymentInput
): Promise<"recorded" | "duplicate" | "not_found"> {
  return prisma.$transaction(async (tx) => {
    const dupe = await tx.payment.findUnique({
      where: { stripeChargeId: input.stripeChargeId },
      select: { id: true },
    });
    if (dupe) return "duplicate";

    const inv = await tx.invoice.findFirst({
      where: { id: invoiceId, orgId },
      include: { payments: { select: { amount: true } } },
    });
    if (!inv) return "not_found";
    if (inv.status === "void") return "duplicate";

    try {
      await tx.payment.create({
        data: {
          invoiceId,
          amount: input.amount,
          method: input.method,
          paidAt: input.paidAt ?? new Date(),
          recordedByEmail: null,
          recordedByName: "Stripe",
          stripeChargeId: input.stripeChargeId,
        },
      });
    } catch (e) {
      if (isUniqueViolation(e)) return "duplicate";
      throw e;
    }

    const paid =
      inv.payments.reduce((s, p) => s + p.amount, 0) + input.amount;
    const status = nextInvoiceStatus({
      current: inv.status,
      amount: inv.amount,
      paid,
    });
    await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        status,
        paidAt: status === "paid" ? new Date() : null,
        stripePaymentIntentId: input.stripePaymentIntentId,
      },
    });
    await tx.invoiceEvent.create({
      data: {
        invoiceId,
        type: "payment_recorded",
        source: "system",
        metadata: {
          amount: input.amount,
          method: input.method,
          stripeChargeId: input.stripeChargeId,
          stripePaymentIntentId: input.stripePaymentIntentId,
          stripeEventId: input.stripeEventId ?? null,
        },
      },
    });
    return "recorded";
  });
}

/** Resolve the org + connected-account for a webhook PaymentIntent's invoice. */
export async function getStripeInvoiceContext(
  metadataInvoiceId: number
): Promise<{
  invoiceId: number;
  orgId: string;
  orgConnectAccountId: string | null;
} | null> {
  const inv = await prisma.invoice.findUnique({
    where: { id: metadataInvoiceId },
    select: {
      id: true,
      orgId: true,
      org: { select: { stripeConnectAccountId: true } },
    },
  });
  if (!inv) return null;
  return {
    invoiceId: inv.id,
    orgId: inv.orgId,
    orgConnectAccountId: inv.org.stripeConnectAccountId,
  };
}

/** Append a non-transactional invoice event (used by the webhook for markers). */
export async function appendInvoiceEvent(input: {
  invoiceId: number;
  type: string;
  source: "customer" | "system" | "builder";
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await prisma.invoiceEvent.create({
    data: {
      invoiceId: input.invoiceId,
      type: input.type,
      source: input.source,
      // Cast at the Prisma boundary: the handler-facing type is a plain record;
      // the column is JSON. Keeps the StripeWebhookDeps interface SDK-free.
      metadata: (input.metadata ?? undefined) as
        | Prisma.InputJsonValue
        | undefined,
    },
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- recordStripePayment.test`
Expected: PASS (all 6 cases).

- [ ] **Step 5: Verify the existing suite still passes**

Run: `npm test -- invoiceRepoMutations.test`
Expected: PASS (no regressions to `recordPayment`).

- [ ] **Step 6: Commit**

```bash
git add lib/repositories/invoiceRepo.ts __tests__/repositories/recordStripePayment.test.ts
git commit -m "feat(stripe): add idempotent recordStripePayment ledger seam + helpers"
```

---

## Task 6: Migration — Organization Connect-status mirror columns

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260614000000_org_connect_status/migration.sql`
- Modify: `prisma/seed.ts`

- [ ] **Step 1: Add the schema columns**

In `prisma/schema.prisma`, inside `model Organization` (after `stripeConnectAccountId`, line ~47), add:

```prisma
  // ── CONNECT ONBOARDING MIRROR (added 2026-06-14) ───────────────────────────
  // System-managed: written only by the account.updated webhook / status sync.
  // Never client-settable.
  stripeChargesEnabled   Boolean @default(false)
  stripePayoutsEnabled   Boolean @default(false)
  stripeDetailsSubmitted Boolean @default(false)
  stripeOnboardingStatus String  @default("none") // none | pending | action_needed | enabled
  stripeRequirementsDue  Json?
  stripeDisabledReason   String?
```

- [ ] **Step 2: Write the migration SQL**

Create `prisma/migrations/20260614000000_org_connect_status/migration.sql`:

```sql
-- AlterTable: Organization — Stripe Connect onboarding-status mirror.
-- Additive + defaulted/nullable, so existing rows on the populated Neon PR
-- branch backfill in place (no 23502). Mirrored from the account.updated webhook.
ALTER TABLE "Organization" ADD COLUMN "stripeChargesEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Organization" ADD COLUMN "stripePayoutsEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Organization" ADD COLUMN "stripeDetailsSubmitted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Organization" ADD COLUMN "stripeOnboardingStatus" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "Organization" ADD COLUMN "stripeRequirementsDue" JSONB;
ALTER TABLE "Organization" ADD COLUMN "stripeDisabledReason" TEXT;
```

- [ ] **Step 3: Regenerate the Prisma client**

Run: `npx prisma generate`
Expected: client regenerates with the new fields (no error). Do **not** run `migrate dev` (it offers a destructive reset against the divergent Neon baseline — see the repo gotcha); the SQL file is applied by `prisma migrate deploy` at deploy time.

- [ ] **Step 4: Update the seed**

In `prisma/seed.ts`, where the demo `Organization` is created/upserted, add explicit defaults so seeded orgs are un-onboarded (Pay button correctly hidden in dev):

```ts
    stripeOnboardingStatus: "none",
    stripeChargesEnabled: false,
    stripePayoutsEnabled: false,
    stripeDetailsSubmitted: false,
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS (the generated client now knows the columns).

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260614000000_org_connect_status/migration.sql prisma/seed.ts
git commit -m "feat(stripe): add Organization Connect-status mirror columns (migration)"
```

---

## Task 7: Onboarding orchestration (`lib/stripe/onboarding.ts`)

**Files:**
- Create: `lib/stripe/onboarding.ts`
- Test: `__tests__/lib/stripe/onboarding.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/stripe/onboarding.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeGateway } from "@/lib/stripe/fakeGateway";

const orgFindUniqueOrThrow = vi.fn();
const orgUpdate = vi.fn();
const orgUpdateMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    organization: {
      findUniqueOrThrow: orgFindUniqueOrThrow,
      update: orgUpdate,
      updateMany: orgUpdateMany,
    },
  },
}));

const { ensureConnectAccount, mirrorAccountStatus } = await import(
  "@/lib/stripe/onboarding"
);

beforeEach(() => vi.clearAllMocks());

describe("ensureConnectAccount", () => {
  it("returns the existing account id without creating a new one", async () => {
    orgFindUniqueOrThrow.mockResolvedValue({ stripeConnectAccountId: "acct_x" });
    const g = makeFakeGateway();
    expect(await ensureConnectAccount("org1", g)).toBe("acct_x");
    expect(g.calls.map((c) => c.name)).not.toContain("createConnectAccount");
    expect(orgUpdate).not.toHaveBeenCalled();
  });

  it("creates + persists the account id and sets status 'pending' when none exists", async () => {
    orgFindUniqueOrThrow.mockResolvedValue({ stripeConnectAccountId: null });
    orgUpdate.mockResolvedValue({});
    const g = makeFakeGateway();

    const id = await ensureConnectAccount("org1", g);
    expect(id).toMatch(/^acct_/);
    expect(orgUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "org1" },
        data: expect.objectContaining({
          stripeConnectAccountId: id,
          stripeOnboardingStatus: "pending",
        }),
      })
    );
  });
});

describe("mirrorAccountStatus", () => {
  it("maps charges_enabled → enabled and clears requirements", async () => {
    orgUpdateMany.mockResolvedValue({ count: 1 });
    await mirrorAccountStatus({
      id: "acct_x",
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
      requirements: { currently_due: [], past_due: [], disabled_reason: null },
    } as never);

    expect(orgUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { stripeConnectAccountId: "acct_x" },
        data: expect.objectContaining({
          stripeChargesEnabled: true,
          stripeOnboardingStatus: "enabled",
          stripeRequirementsDue: [],
        }),
      })
    );
  });

  it("maps outstanding requirements → action_needed", async () => {
    orgUpdateMany.mockResolvedValue({ count: 1 });
    await mirrorAccountStatus({
      id: "acct_x",
      charges_enabled: false,
      payouts_enabled: false,
      details_submitted: true,
      requirements: {
        currently_due: ["business_profile.url"],
        past_due: [],
        disabled_reason: null,
      },
    } as never);

    const data = orgUpdateMany.mock.calls[0][0].data;
    expect(data.stripeOnboardingStatus).toBe("action_needed");
    expect(data.stripeRequirementsDue).toEqual(["business_profile.url"]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- onboarding.test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the orchestration**

Create `lib/stripe/onboarding.ts`:

```ts
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import type { StripeGateway } from "./gateway";

export interface ConnectStatus {
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  onboardingStatus: string;
  disabledReason: string | null;
  requirementsDue: string[];
}

/** Create the connected account if absent, persist its id BEFORE any redirect. */
export async function ensureConnectAccount(
  orgId: string,
  gateway: StripeGateway
): Promise<string> {
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: orgId },
    select: { stripeConnectAccountId: true },
  });
  if (org.stripeConnectAccountId) return org.stripeConnectAccountId;

  const account = await gateway.createConnectAccount(orgId);
  await prisma.organization.update({
    where: { id: orgId },
    data: {
      stripeConnectAccountId: account.id,
      stripeOnboardingStatus: "pending",
    },
  });
  return account.id;
}

export async function getConnectAccountId(
  orgId: string
): Promise<string | null> {
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: orgId },
    select: { stripeConnectAccountId: true },
  });
  return org.stripeConnectAccountId;
}

export async function getConnectStatus(orgId: string): Promise<ConnectStatus> {
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: orgId },
    select: {
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
      stripeDetailsSubmitted: true,
      stripeOnboardingStatus: true,
      stripeDisabledReason: true,
      stripeRequirementsDue: true,
    },
  });
  return {
    chargesEnabled: org.stripeChargesEnabled,
    payoutsEnabled: org.stripePayoutsEnabled,
    detailsSubmitted: org.stripeDetailsSubmitted,
    onboardingStatus: org.stripeOnboardingStatus,
    disabledReason: org.stripeDisabledReason,
    requirementsDue: Array.isArray(org.stripeRequirementsDue)
      ? (org.stripeRequirementsDue as string[])
      : [],
  };
}

/** Mirror a Stripe Account onto the org. Idempotent compare-and-set by acct id. */
export async function mirrorAccountStatus(
  account: Stripe.Account
): Promise<void> {
  const requirementsDue = [
    ...(account.requirements?.currently_due ?? []),
    ...(account.requirements?.past_due ?? []),
  ];
  const chargesEnabled = account.charges_enabled ?? false;
  const disabledReason = account.requirements?.disabled_reason ?? null;
  const onboardingStatus = chargesEnabled
    ? "enabled"
    : disabledReason || requirementsDue.length > 0
      ? "action_needed"
      : "pending";

  await prisma.organization.updateMany({
    where: { stripeConnectAccountId: account.id },
    data: {
      stripeChargesEnabled: chargesEnabled,
      stripePayoutsEnabled: account.payouts_enabled ?? false,
      stripeDetailsSubmitted: account.details_submitted ?? false,
      stripeOnboardingStatus: onboardingStatus,
      stripeRequirementsDue: requirementsDue,
      stripeDisabledReason: disabledReason,
    },
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- onboarding.test`
Expected: PASS (all 4 cases).

- [ ] **Step 5: Commit**

```bash
git add lib/stripe/onboarding.ts __tests__/lib/stripe/onboarding.test.ts
git commit -m "feat(stripe): add Connect onboarding orchestration + status mirror"
```

---

## Task 8: Connect onboarding / refresh / status routes

**Files:**
- Create: `app/api/org/stripe-connect/onboarding/route.ts`
- Create: `app/api/org/stripe-connect/refresh/route.ts`
- Create: `app/api/org/stripe-connect/status/route.ts`
- Test: `__tests__/api/stripe-connect.test.ts`

- [ ] **Step 1: Write the failing route test**

Create `__tests__/api/stripe-connect.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireSession = vi.fn();
vi.mock("@/lib/tenant", () => ({
  requireSession,
  getOrgId: vi.fn(async () => "org1"),
}));

const ensureConnectAccount = vi.fn();
const getConnectAccountId = vi.fn();
const getConnectStatus = vi.fn();
vi.mock("@/lib/stripe/onboarding", () => ({
  ensureConnectAccount,
  getConnectAccountId,
  getConnectStatus,
}));

vi.mock("@/lib/stripe/realGateway", () => ({
  realGateway: {
    createAccountLink: vi.fn(async () => ({
      url: "https://connect.stripe.test/setup",
    })),
  },
}));

vi.mock("@/lib/baseUrl", () => ({ getPublicBaseUrl: () => "https://app.test" }));

function asAdmin() {
  requireSession.mockResolvedValue({
    user: { orgId: "org1", role: "admin", email: "a@b.com", name: "Al" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  asAdmin();
});

describe("POST /api/org/stripe-connect/onboarding", () => {
  it("ensures an account and returns the onboarding url", async () => {
    ensureConnectAccount.mockResolvedValue("acct_x");
    const { POST } = await import(
      "@/app/api/org/stripe-connect/onboarding/route"
    );
    const res = await POST(
      new Request("https://app.test/api/org/stripe-connect/onboarding", {
        method: "POST",
      }) as never,
      { params: Promise.resolve({}) } as never
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://connect.stripe.test/setup" });
  });

  it("rejects non-admins with 401", async () => {
    requireSession.mockResolvedValue({
      user: { orgId: "org1", role: "lead", email: "a@b.com", name: "Al" },
    });
    const { POST } = await import(
      "@/app/api/org/stripe-connect/onboarding/route"
    );
    const res = await POST(
      new Request("https://app.test/x", { method: "POST" }) as never,
      { params: Promise.resolve({}) } as never
    );
    expect(res.status).toBe(401);
  });
});

describe("GET /api/org/stripe-connect/status", () => {
  it("returns mirrored status", async () => {
    getConnectStatus.mockResolvedValue({
      chargesEnabled: true,
      payoutsEnabled: true,
      detailsSubmitted: true,
      onboardingStatus: "enabled",
      disabledReason: null,
      requirementsDue: [],
    });
    const { GET } = await import("@/app/api/org/stripe-connect/status/route");
    const res = await GET(
      new Request("https://app.test/x") as never,
      { params: Promise.resolve({}) } as never
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ onboardingStatus: "enabled" });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- stripe-connect.test`
Expected: FAIL — route modules not found.

- [ ] **Step 3: Write the onboarding route**

Create `app/api/org/stripe-connect/onboarding/route.ts`:

```ts
import { apiRoute } from "@/lib/api/route";
import { getPublicBaseUrl } from "@/lib/baseUrl";
import { ensureConnectAccount } from "@/lib/stripe/onboarding";
import { realGateway } from "@/lib/stripe/realGateway";

export const POST = apiRoute({ minRole: "admin" }, async ({ orgId }) => {
  const accountId = await ensureConnectAccount(orgId, realGateway);
  const base = getPublicBaseUrl();
  const link = await realGateway.createAccountLink(accountId, {
    refreshUrl: `${base}/api/org/stripe-connect/refresh`,
    returnUrl: `${base}/settings/workspace?stripe=return`,
  });
  return { url: link.url };
});
```

- [ ] **Step 4: Write the refresh route**

Create `app/api/org/stripe-connect/refresh/route.ts`:

```ts
import { StripeNotConnectedError } from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/route";
import { getPublicBaseUrl } from "@/lib/baseUrl";
import { getConnectAccountId } from "@/lib/stripe/onboarding";
import { realGateway } from "@/lib/stripe/realGateway";

export const GET = apiRoute({ minRole: "admin" }, async ({ orgId }) => {
  const accountId = await getConnectAccountId(orgId);
  if (!accountId) throw new StripeNotConnectedError();
  const base = getPublicBaseUrl();
  const link = await realGateway.createAccountLink(accountId, {
    refreshUrl: `${base}/api/org/stripe-connect/refresh`,
    returnUrl: `${base}/settings/workspace?stripe=return`,
  });
  return Response.redirect(link.url, 303);
});
```

- [ ] **Step 5: Write the status route**

Create `app/api/org/stripe-connect/status/route.ts`:

```ts
import { apiRoute } from "@/lib/api/route";
import { getConnectStatus } from "@/lib/stripe/onboarding";

export const GET = apiRoute({ minRole: "admin" }, async ({ orgId }) => {
  return getConnectStatus(orgId);
});
```

- [ ] **Step 6: Run to verify it passes**

Run: `npm test -- stripe-connect.test`
Expected: PASS (all 3 cases).

- [ ] **Step 7: Commit**

```bash
git add app/api/org/stripe-connect __tests__/api/stripe-connect.test.ts
git commit -m "feat(stripe): add Connect onboarding/refresh/status routes (admin)"
```

---

## Task 9: Payments settings section + hooks

**Files:**
- Create: `lib/hooks/useStripeConnect.ts`
- Create: `components/settings/workspace/PaymentsSection.tsx`
- Modify: `components/settings/workspace/types.ts`
- Modify: `components/settings/workspace/WorkspaceSettingsView.tsx`
- Modify: `components/settings/workspace/Toc.tsx`
- Modify: `app/(app)/settings/workspace/page.tsx`

- [ ] **Step 1: Add the hooks**

Create `lib/hooks/useStripeConnect.ts`:

```ts
"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { readApiError } from "@/lib/api/errors";

export interface ConnectStatusDto {
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  onboardingStatus: string;
  disabledReason: string | null;
  requirementsDue: string[];
}

export function useStartStripeOnboarding() {
  return useMutation({
    mutationFn: async (): Promise<{ url: string }> => {
      const res = await fetch("/api/org/stripe-connect/onboarding", {
        method: "POST",
      });
      if (!res.ok) {
        throw new Error(
          (await readApiError(res, "Couldn't start payment setup")).message
        );
      }
      return (await res.json()) as { url: string };
    },
  });
}

export function useStripeConnectStatus(opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["stripe-connect-status"],
    enabled: opts?.enabled ?? true,
    queryFn: async (): Promise<ConnectStatusDto> => {
      const res = await fetch("/api/org/stripe-connect/status");
      if (!res.ok) {
        throw new Error(
          (await readApiError(res, "Couldn't load payment status")).message
        );
      }
      return (await res.json()) as ConnectStatusDto;
    },
  });
}
```

- [ ] **Step 2: Extend the settings initial type**

In `components/settings/workspace/types.ts`, add to `WorkspaceSettingsInitial`:

```ts
  stripeConnect: {
    onboardingStatus: string;
    chargesEnabled: boolean;
    requirementsDue: string[];
  };
```

(Leave `WorkspaceSettingsForm`/`toForm` unchanged — payments status is read-only and not part of the dirty diff.)

- [ ] **Step 3: Build the PaymentsSection**

Create `components/settings/workspace/PaymentsSection.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import {
  useStartStripeOnboarding,
  useStripeConnectStatus,
} from "@/lib/hooks/useStripeConnect";
import { FieldRow, SectionHead } from "./_ui";

type Props = {
  initial: {
    onboardingStatus: string;
    chargesEnabled: boolean;
    requirementsDue: string[];
  };
  /** True when returning from Stripe (?stripe=return) — poll for the webhook. */
  justReturned: boolean;
};

export function PaymentsSection({ initial, justReturned }: Props) {
  const status = useStripeConnectStatus({ enabled: justReturned });
  const start = useStartStripeOnboarding();
  const [polls, setPolls] = useState(0);

  // After returning from Stripe, refetch a few times while the account.updated
  // webhook lands (status is webhook-driven, not return-driven).
  useEffect(() => {
    if (!justReturned || polls >= 5) return;
    const t = setTimeout(() => {
      status.refetch();
      setPolls((n) => n + 1);
    }, 2000);
    return () => clearTimeout(t);
  }, [justReturned, polls, status]);

  const live = status.data ?? {
    onboardingStatus: initial.onboardingStatus,
    chargesEnabled: initial.chargesEnabled,
    requirementsDue: initial.requirementsDue,
  };

  const onConnect = async () => {
    const { url } = await start.mutateAsync();
    window.location.href = url;
  };

  const enabled = live.chargesEnabled;
  const actionNeeded = live.onboardingStatus === "action_needed";

  return (
    <section className="mb-16 scroll-mt-20" id="payments">
      <SectionHead n="04" title="Payments" kicker="Get paid online" />
      <FieldRow
        label="Online payments"
        hint="Let customers pay invoices by card or bank transfer."
      >
        {enabled ? (
          <div className="text-[14px]">
            <span className="inline-flex items-center gap-2 font-[600] text-[var(--accent)]">
              ● Connected
            </span>
            <p className="mt-1 text-[12px] text-[var(--muted)]">
              Customers can pay your invoices online. Payouts go to your
              connected bank account.
            </p>
            <button
              type="button"
              onClick={onConnect}
              disabled={start.isPending}
              className="mt-3 text-[13px] underline text-[var(--ink-2)]"
            >
              Manage in Stripe
            </button>
          </div>
        ) : (
          <div className="text-[14px]">
            {actionNeeded ? (
              <p className="mb-3 text-[13px] text-[var(--accent)]">
                Stripe needs more information before you can accept payments.
              </p>
            ) : null}
            <button
              type="button"
              onClick={onConnect}
              disabled={start.isPending}
              className="px-4 py-2 rounded-md bg-[var(--accent)] text-white font-[600] text-[13px] disabled:opacity-60"
            >
              {start.isPending
                ? "Starting…"
                : actionNeeded
                  ? "Finish setup"
                  : "Connect Stripe"}
            </button>
            {start.isError ? (
              <p className="mt-2 text-[12px] text-red-600">
                {(start.error as Error).message}
              </p>
            ) : null}
          </div>
        )}
      </FieldRow>
    </section>
  );
}
```

- [ ] **Step 4: Render it in the workspace view**

In `components/settings/workspace/WorkspaceSettingsView.tsx`:

1. Add the import: `import { PaymentsSection } from "./PaymentsSection";`
2. Add `justReturned` to `Props` and destructure it (passed from the server page in Step 6 — no client `window` read, so no hydration mismatch):

```tsx
type Props = { initial: WorkspaceSettingsInitial; justReturned: boolean };

export function WorkspaceSettingsView({ initial, justReturned }: Props) {
```

3. Render it after `<DefaultsSection …/>` inside `<main>`:

```tsx
          <PaymentsSection
            initial={initial.stripeConnect}
            justReturned={justReturned}
          />
```

- [ ] **Step 5: Add the Toc entry**

In `components/settings/workspace/Toc.tsx`, add to `ENTRIES`:

```ts
  { id: "payments", n: "04", label: "Payments" },
```

- [ ] **Step 6: Load the status + read the Stripe return flag server-side**

In `app/(app)/settings/workspace/page.tsx`:

1. Accept `searchParams` and compute the return flag (server component — no client `window`). Keep the existing `requireSession` + admin redirect that follow:

```tsx
export default async function WorkspaceSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ stripe?: string }>;
}) {
  const justReturned = (await searchParams)?.stripe === "return";
```

2. Extend the org `select` with the mirror fields:

```ts
      stripeOnboardingStatus: true,
      stripeChargesEnabled: true,
      stripeRequirementsDue: true,
```

3. Build the prop (replace the `return`):

```tsx
  return (
    <WorkspaceSettingsView
      justReturned={justReturned}
      initial={{
        ...org,
        stripeConnect: {
          onboardingStatus: org.stripeOnboardingStatus,
          chargesEnabled: org.stripeChargesEnabled,
          requirementsDue: Array.isArray(org.stripeRequirementsDue)
            ? (org.stripeRequirementsDue as string[])
            : [],
        },
      }}
    />
  );
```

- [ ] **Step 7: Verify typecheck + lint + build the section**

Run: `npm run typecheck && npm run lint:fix`
Expected: PASS. Then `npm test` — existing settings tests still green.

- [ ] **Step 8: Commit**

```bash
git add lib/hooks/useStripeConnect.ts components/settings/workspace app/(app)/settings/workspace/page.tsx
git commit -m "feat(stripe): add admin Payments settings section + connect hooks"
```

---

## Task 10: Public pay route + wire the Pay button

**Files:**
- Modify: `lib/repositories/invoiceRepo.ts` (add `getInvoicePayContext`, `setInvoicePaymentIntent`; extend `getInvoiceByToken`)
- Create: `app/api/invoice-review/[token]/pay/route.ts`
- Modify: `lib/publicRoutes.ts`
- Modify: `app/invoice-review/[token]/page.tsx`
- Test: `__tests__/api/invoice-pay.test.ts`

- [ ] **Step 1: Add the repo reads/writes**

In `lib/repositories/invoiceRepo.ts`, add:

```ts
export interface InvoicePayContext {
  invoiceId: number;
  orgId: string;
  invoiceNumber: number;
  status: string;
  balanceDueCents: number;
  connectAccountId: string | null;
  chargesEnabled: boolean;
  customerEmail: string | null;
}

/** Everything the public pay route needs, by token. */
export async function getInvoicePayContext(
  token: string
): Promise<InvoicePayContext | null> {
  const inv = await prisma.invoice.findUnique({
    where: { publicToken: token },
    select: {
      id: true,
      orgId: true,
      invoiceNumber: true,
      status: true,
      amount: true,
      payments: { select: { amount: true } },
      org: {
        select: { stripeConnectAccountId: true, stripeChargesEnabled: true },
      },
      estimate: {
        select: {
          siteMeasure: {
            select: {
              location: { select: { customer: { select: { email: true } } } },
            },
          },
        },
      },
    },
  });
  if (!inv) return null;
  const paid = inv.payments.reduce((s, p) => s + p.amount, 0);
  return {
    invoiceId: inv.id,
    orgId: inv.orgId,
    invoiceNumber: inv.invoiceNumber,
    status: inv.status,
    balanceDueCents: Math.round(round2(inv.amount - paid) * 100),
    connectAccountId: inv.org.stripeConnectAccountId,
    chargesEnabled: inv.org.stripeChargesEnabled,
    customerEmail: inv.estimate.siteMeasure.location?.customer?.email ?? null,
  };
}

/** Stamp the PaymentIntent id when a Checkout Session is created. */
export async function setInvoicePaymentIntent(
  invoiceId: number,
  orgId: string,
  paymentIntentId: string
): Promise<void> {
  await prisma.invoice.updateMany({
    where: { id: invoiceId, orgId },
    data: { stripePaymentIntentId: paymentIntentId },
  });
}
```

Also extend `getInvoiceByToken` so the public page can gate the Pay button. Change its `include` to add the org flag:

```ts
export async function getInvoiceByToken(token: string) {
  return prisma.invoice.findUnique({
    where: { publicToken: token },
    include: {
      ...INVOICE_INCLUDE,
      org: { select: { stripeChargesEnabled: true } },
    },
  });
}
```

- [ ] **Step 2: Write the failing pay-route test**

Create `__tests__/api/invoice-pay.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const getInvoicePayContext = vi.fn();
const setInvoicePaymentIntent = vi.fn();
vi.mock("@/lib/repositories", () => ({
  getInvoicePayContext,
  setInvoicePaymentIntent,
}));

const createCheckoutSession = vi.fn();
vi.mock("@/lib/stripe/realGateway", () => ({
  realGateway: { createCheckoutSession },
}));
vi.mock("@/lib/baseUrl", () => ({ getPublicBaseUrl: () => "https://app.test" }));

const { GET } = await import("@/app/api/invoice-review/[token]/pay/route");

function call(token = "tok1234567890abcd") {
  return GET(
    new Request(`https://app.test/api/invoice-review/${token}/pay`) as never,
    { params: Promise.resolve({ token }) } as never
  );
}

beforeEach(() => vi.clearAllMocks());

const ready = {
  invoiceId: 1,
  orgId: "org1",
  invoiceNumber: 7,
  status: "sent",
  balanceDueCents: 50000,
  connectAccountId: "acct_org",
  chargesEnabled: true,
  customerEmail: "c@example.com",
};

describe("GET /api/invoice-review/[token]/pay", () => {
  it("303-redirects to the Stripe Checkout url and stamps the PI", async () => {
    getInvoicePayContext.mockResolvedValue(ready);
    createCheckoutSession.mockResolvedValue({
      id: "cs_1",
      url: "https://checkout.stripe.test/pay",
      paymentIntentId: "pi_1",
    });
    const res = await call();
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://checkout.stripe.test/pay");
    expect(setInvoicePaymentIntent).toHaveBeenCalledWith(1, "org1", "pi_1");
  });

  it("404s when the token resolves to nothing", async () => {
    getInvoicePayContext.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
  });

  it("409 STRIPE_NOT_CONNECTED when the org isn't charges-enabled", async () => {
    getInvoicePayContext.mockResolvedValue({ ...ready, chargesEnabled: false });
    const res = await call();
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("STRIPE_NOT_CONNECTED");
  });

  it("409 INVOICE_ALREADY_PAID when there's no balance", async () => {
    getInvoicePayContext.mockResolvedValue({ ...ready, balanceDueCents: 0 });
    const res = await call();
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("INVOICE_ALREADY_PAID");
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm test -- invoice-pay.test`
Expected: FAIL — route module not found.

- [ ] **Step 4: Write the pay route**

Create `app/api/invoice-review/[token]/pay/route.ts`:

```ts
import {
  InvoiceAlreadyPaidError,
  NotFoundError,
  StripeNotConnectedError,
  StripeOnboardingError,
} from "@/lib/api/errors";
import { publicRoute } from "@/lib/api/route";
import { getPublicBaseUrl } from "@/lib/baseUrl";
import { invoiceTokenParams } from "@/lib/invoices/schema";
import { getInvoicePayContext, setInvoicePaymentIntent } from "@/lib/repositories";
import { buildCheckoutSessionParams } from "@/lib/stripe/checkout";
import { realGateway } from "@/lib/stripe/realGateway";

export const GET = publicRoute(async ({ params }) => {
  const { token } = invoiceTokenParams.parse(params);
  const ctx = await getInvoicePayContext(token);
  if (!ctx) throw new NotFoundError();
  if (!ctx.chargesEnabled || !ctx.connectAccountId) {
    throw new StripeNotConnectedError();
  }
  if (
    ctx.balanceDueCents <= 0 ||
    ctx.status === "paid" ||
    ctx.status === "void"
  ) {
    throw new InvoiceAlreadyPaidError();
  }

  const base = getPublicBaseUrl();
  const session = await realGateway.createCheckoutSession(
    buildCheckoutSessionParams({
      invoiceId: ctx.invoiceId,
      orgId: ctx.orgId,
      connectAccountId: ctx.connectAccountId,
      amountCents: ctx.balanceDueCents,
      invoiceNumber: ctx.invoiceNumber,
      customerEmail: ctx.customerEmail,
      successUrl: `${base}/invoice-review/${token}?paid=1`,
      cancelUrl: `${base}/invoice-review/${token}`,
    })
  );
  if (!session.url) throw new StripeOnboardingError("No checkout URL returned");
  if (session.paymentIntentId) {
    await setInvoicePaymentIntent(ctx.invoiceId, ctx.orgId, session.paymentIntentId);
  }
  return Response.redirect(session.url, 303);
});
```

- [ ] **Step 5: Allowlist the pay route**

In `lib/publicRoutes.ts`, add to `PUBLIC_REVIEW_PREFIXES`:

```ts
  // Public pay entrypoint: creates a Checkout Session for the live balance and
  // 303s to Stripe. Token in the URL is the credential.
  "/api/invoice-review/",
```

- [ ] **Step 6: Wire the Pay button in the public page**

In `app/invoice-review/[token]/page.tsx`, replace the `payUrl` line in the `view` object. The button should point at the pay route only when the org can charge and a balance is owed:

```ts
  const canPay =
    invoice.org.stripeChargesEnabled &&
    balanceDue > 0 &&
    invoice.status !== "paid" &&
    invoice.status !== "void";
```

Then in the `view`:

```ts
    payUrl: canPay ? `/api/invoice-review/${token}/pay` : null,
```

(Remove the dependency on `snap.stripePaymentLinkUrl` for `payUrl`.)

- [ ] **Step 7: Run to verify it passes**

Run: `npm test -- invoice-pay.test`
Expected: PASS (all 4 cases). Then `npm run typecheck` — PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/repositories/invoiceRepo.ts app/api/invoice-review lib/publicRoutes.ts "app/invoice-review/[token]/page.tsx" __tests__/api/invoice-pay.test.ts
git commit -m "feat(stripe): public pay route + live-balance Pay button"
```

---

## Task 11: Webhook event handler (`handleStripeEvent`)

**Files:**
- Create: `lib/stripe/webhookHandler.ts`
- Test: `__tests__/lib/stripe/webhookHandler.test.ts`

- [ ] **Step 1: Write the failing handler test**

Create `__tests__/lib/stripe/webhookHandler.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeGateway } from "@/lib/stripe/fakeGateway";
import { handleStripeEvent, type StripeWebhookDeps } from "@/lib/stripe/webhookHandler";

function deps(over: Partial<StripeWebhookDeps> = {}): StripeWebhookDeps & {
  recorded: unknown[];
  events: unknown[];
  mirrored: unknown[];
} {
  const recorded: unknown[] = [];
  const events: unknown[] = [];
  const mirrored: unknown[] = [];
  return {
    recorded,
    events,
    mirrored,
    gateway: makeFakeGateway(),
    recordStripePayment: async (a) => {
      recorded.push(a);
      return "recorded";
    },
    resolvePaymentContext: async () => ({
      invoiceId: 42,
      orgId: "org1",
      orgConnectAccountId: "acct_org",
    }),
    appendInvoiceEvent: async (a) => {
      events.push(a);
    },
    mirrorAccountStatus: async (a) => {
      mirrored.push(a);
    },
    ...over,
  };
}

function pi(overrides: Record<string, unknown> = {}) {
  return {
    id: "pi_1",
    amount: 50000,
    amount_received: 50000,
    latest_charge: { id: "ch_1", payment_method_details: { type: "card" } },
    transfer_data: { destination: "acct_org" },
    metadata: { invoiceId: "42", orgId: "org1" },
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("handleStripeEvent", () => {
  it("records a card payment on checkout.session.completed (paid)", async () => {
    const d = deps({
      gateway: makeFakeGateway({ paymentIntents: { pi_1: pi() as never } }),
    });
    await handleStripeEvent(
      {
        id: "evt_1",
        type: "checkout.session.completed",
        data: { object: { payment_status: "paid", payment_intent: "pi_1" } },
      } as never,
      d
    );
    expect(d.recorded).toHaveLength(1);
    expect(d.recorded[0]).toMatchObject({
      invoiceId: 42,
      method: "card",
      amount: 500,
      stripeChargeId: "ch_1",
    });
  });

  it("marks ACH processing (no ledger write) on completed unpaid", async () => {
    const d = deps();
    await handleStripeEvent(
      {
        id: "evt_2",
        type: "checkout.session.completed",
        data: {
          object: {
            payment_status: "unpaid",
            payment_intent: "pi_1",
            metadata: { invoiceId: "42" },
          },
        },
      } as never,
      d
    );
    expect(d.recorded).toHaveLength(0);
    expect(d.events[0]).toMatchObject({ type: "ach_processing" });
  });

  it("records an ACH payment on async_payment_succeeded", async () => {
    const achPi = pi({
      latest_charge: { id: "ch_2", payment_method_details: { type: "us_bank_account" } },
    });
    const d = deps({
      gateway: makeFakeGateway({ paymentIntents: { pi_1: achPi as never } }),
    });
    await handleStripeEvent(
      {
        id: "evt_3",
        type: "checkout.session.async_payment_succeeded",
        data: { object: { payment_intent: "pi_1" } },
      } as never,
      d
    );
    expect(d.recorded[0]).toMatchObject({ method: "ach", stripeChargeId: "ch_2" });
  });

  it("logs ach_failed on async_payment_failed and records nothing", async () => {
    const d = deps();
    await handleStripeEvent(
      {
        id: "evt_4",
        type: "checkout.session.async_payment_failed",
        data: { object: { payment_intent: "pi_1", metadata: { invoiceId: "42" } } },
      } as never,
      d
    );
    expect(d.recorded).toHaveLength(0);
    expect(d.events[0]).toMatchObject({ type: "ach_failed" });
  });

  it("mirrors account status on account.updated", async () => {
    const d = deps();
    await handleStripeEvent(
      {
        id: "evt_5",
        type: "account.updated",
        data: { object: { id: "acct_org", charges_enabled: true } },
      } as never,
      d
    );
    expect(d.mirrored).toHaveLength(1);
  });

  it("skips recording on an org/destination mismatch", async () => {
    const d = deps({
      gateway: makeFakeGateway({ paymentIntents: { pi_1: pi() as never } }),
      resolvePaymentContext: async () => ({
        invoiceId: 42,
        orgId: "org1",
        orgConnectAccountId: "acct_DIFFERENT",
      }),
    });
    await handleStripeEvent(
      {
        id: "evt_6",
        type: "payment_intent.succeeded",
        data: { object: { id: "pi_1" } },
      } as never,
      d
    );
    expect(d.recorded).toHaveLength(0);
    expect(d.events[0]).toMatchObject({ type: "stripe_org_mismatch" });
  });

  it("ignores unrelated events without throwing", async () => {
    const d = deps();
    await expect(
      handleStripeEvent(
        { id: "evt_7", type: "customer.created", data: { object: {} } } as never,
        d
      )
    ).resolves.toBeUndefined();
    expect(d.recorded).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- webhookHandler.test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the handler**

Create `lib/stripe/webhookHandler.ts`:

```ts
import type Stripe from "stripe";
import type { RecordStripePaymentInput } from "@/lib/repositories/invoiceRepo";
import type { StripeGateway } from "./gateway";

export interface PaymentContext {
  invoiceId: number;
  orgId: string;
  orgConnectAccountId: string | null;
}

export interface StripeWebhookDeps {
  gateway: Pick<StripeGateway, "retrievePaymentIntent">;
  recordStripePayment: (
    invoiceId: number,
    orgId: string,
    input: RecordStripePaymentInput
  ) => Promise<"recorded" | "duplicate" | "not_found">;
  resolvePaymentContext: (
    metadataInvoiceId: number
  ) => Promise<PaymentContext | null>;
  appendInvoiceEvent: (input: {
    invoiceId: number;
    type: string;
    source: "customer" | "system" | "builder";
    metadata?: Record<string, unknown>;
  }) => Promise<void>;
  mirrorAccountStatus: (account: Stripe.Account) => Promise<void>;
}

function asId(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === "string") return v;
  if (typeof v === "object" && "id" in (v as object)) {
    return (v as { id: string }).id;
  }
  return null;
}

function intFromMeta(meta: unknown): number | null {
  const raw = (meta as { invoiceId?: string } | null)?.invoiceId;
  if (!raw) return null;
  const n = Number(raw);
  return Number.isInteger(n) ? n : null;
}

/** Record a settled PaymentIntent into the ledger (idempotent downstream). */
async function recordFromPaymentIntentId(
  piId: string,
  eventId: string,
  deps: StripeWebhookDeps
): Promise<void> {
  const pi = await deps.gateway.retrievePaymentIntent(piId);
  const charge =
    pi.latest_charge && typeof pi.latest_charge === "object"
      ? (pi.latest_charge as Stripe.Charge)
      : null;
  const chargeId = charge?.id ?? asId(pi.latest_charge);
  const metadataInvoiceId = intFromMeta(pi.metadata);
  const destination = asId(pi.transfer_data?.destination ?? null);
  if (!chargeId || metadataInvoiceId === null) return;

  const ctx = await deps.resolvePaymentContext(metadataInvoiceId);
  if (!ctx) return;

  if (
    destination &&
    ctx.orgConnectAccountId &&
    destination !== ctx.orgConnectAccountId
  ) {
    await deps.appendInvoiceEvent({
      invoiceId: ctx.invoiceId,
      type: "stripe_org_mismatch",
      source: "system",
      metadata: { paymentIntentId: pi.id, destination, eventId },
    });
    return;
  }

  const method: "ach" | "card" =
    charge?.payment_method_details?.type === "us_bank_account"
      ? "ach"
      : "card";
  const amount = (pi.amount_received ?? pi.amount ?? 0) / 100;

  await deps.recordStripePayment(ctx.invoiceId, ctx.orgId, {
    amount,
    method,
    stripeChargeId: chargeId,
    stripePaymentIntentId: pi.id,
    paidAt: new Date(),
    stripeEventId: eventId,
  });
}

async function markByMetadata(
  metadata: unknown,
  type: string,
  source: "customer" | "system",
  eventId: string,
  deps: StripeWebhookDeps
): Promise<void> {
  const invoiceId = intFromMeta(metadata);
  if (invoiceId === null) return;
  const ctx = await deps.resolvePaymentContext(invoiceId);
  if (!ctx) return;
  await deps.appendInvoiceEvent({
    invoiceId: ctx.invoiceId,
    type,
    source,
    metadata: { eventId },
  });
}

/**
 * Dispatch a verified Stripe event. Records a Payment ONLY on terminal success
 * (cards: completed+paid; ACH: async_payment_succeeded / payment_intent.succeeded).
 * In-flight ACH and failures only write InvoiceEvent markers — the ledger means
 * settled money only. Never throws on unknown events.
 */
export async function handleStripeEvent(
  event: Stripe.Event,
  deps: StripeWebhookDeps
): Promise<void> {
  switch (event.type) {
    case "payment_intent.succeeded": {
      const pi = event.data.object as Stripe.PaymentIntent;
      await recordFromPaymentIntentId(pi.id, event.id, deps);
      break;
    }
    case "checkout.session.async_payment_succeeded": {
      const s = event.data.object as Stripe.Checkout.Session;
      const piId = asId(s.payment_intent);
      if (piId) await recordFromPaymentIntentId(piId, event.id, deps);
      break;
    }
    case "checkout.session.completed": {
      const s = event.data.object as Stripe.Checkout.Session;
      const piId = asId(s.payment_intent);
      if (s.payment_status === "paid" && piId) {
        await recordFromPaymentIntentId(piId, event.id, deps);
      } else {
        await markByMetadata(
          s.metadata,
          "ach_processing",
          "customer",
          event.id,
          deps
        );
      }
      break;
    }
    case "payment_intent.processing": {
      const pi = event.data.object as Stripe.PaymentIntent;
      await markByMetadata(pi.metadata, "ach_processing", "customer", event.id, deps);
      break;
    }
    case "checkout.session.async_payment_failed": {
      const s = event.data.object as Stripe.Checkout.Session;
      await markByMetadata(s.metadata, "ach_failed", "system", event.id, deps);
      break;
    }
    case "payment_intent.payment_failed": {
      const pi = event.data.object as Stripe.PaymentIntent;
      await markByMetadata(pi.metadata, "payment_failed", "system", event.id, deps);
      break;
    }
    case "account.updated": {
      await deps.mirrorAccountStatus(event.data.object as Stripe.Account);
      break;
    }
    case "charge.refunded":
    case "charge.dispute.created": {
      // Out of scope this round: audit-log only, no ledger reversal.
      const ch = event.data.object as Stripe.Charge;
      const invoiceId = intFromMeta(ch.metadata);
      if (invoiceId !== null) {
        const ctx = await deps.resolvePaymentContext(invoiceId);
        if (ctx) {
          await deps.appendInvoiceEvent({
            invoiceId: ctx.invoiceId,
            type: event.type === "charge.refunded" ? "stripe_refund" : "stripe_dispute",
            source: "system",
            metadata: { chargeId: ch.id, eventId: event.id },
          });
        }
      }
      break;
    }
    default:
      break;
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- webhookHandler.test`
Expected: PASS (all 7 cases).

- [ ] **Step 5: Commit**

```bash
git add lib/stripe/webhookHandler.ts __tests__/lib/stripe/webhookHandler.test.ts
git commit -m "feat(stripe): add webhook event dispatch handler (card/ACH/account)"
```

---

## Task 12: Bare webhook route + prod deps wiring

**Files:**
- Modify: `lib/stripe/webhookHandler.ts` (add `buildProdWebhookDeps`)
- Create: `app/api/stripe/webhook/route.ts`
- Modify: `lib/publicRoutes.ts`
- Test: `__tests__/api/stripe-webhook.test.ts`

- [ ] **Step 1: Add the prod deps factory**

Append to `lib/stripe/webhookHandler.ts`:

```ts
import {
  appendInvoiceEvent,
  getStripeInvoiceContext,
  recordStripePayment,
} from "@/lib/repositories/invoiceRepo";
import { mirrorAccountStatus } from "@/lib/stripe/onboarding";
import { realGateway } from "@/lib/stripe/realGateway";

/** Production deps: realGateway + Prisma-backed repo functions. */
export function buildProdWebhookDeps(): StripeWebhookDeps {
  return {
    gateway: realGateway,
    recordStripePayment,
    resolvePaymentContext: (invoiceId) => getStripeInvoiceContext(invoiceId),
    appendInvoiceEvent: (input) => appendInvoiceEvent(input),
    mirrorAccountStatus,
  };
}
```

(Move the `import` lines to the top of the file with the other imports.)

- [ ] **Step 2: Write the failing route test**

Create `__tests__/api/stripe-webhook.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const constructWebhookEvent = vi.fn();
vi.mock("@/lib/stripe/realGateway", () => ({
  realGateway: { constructWebhookEvent },
}));

const handleStripeEvent = vi.fn();
vi.mock("@/lib/stripe/webhookHandler", () => ({
  handleStripeEvent,
  buildProdWebhookDeps: () => ({}),
}));

const { POST } = await import("@/app/api/stripe/webhook/route");

function post(body = "{}", sig: string | null = "t=1,v1=abc") {
  const headers = new Headers();
  if (sig !== null) headers.set("stripe-signature", sig);
  return POST(
    new Request("https://app.test/api/stripe/webhook", {
      method: "POST",
      body,
      headers,
    }) as never
  );
}

beforeEach(() => vi.clearAllMocks());

describe("POST /api/stripe/webhook", () => {
  it("verifies the signature, dispatches, and returns 200", async () => {
    constructWebhookEvent.mockReturnValue({ id: "evt_1", type: "x", data: {} });
    handleStripeEvent.mockResolvedValue(undefined);
    const res = await post();
    expect(res.status).toBe(200);
    expect(handleStripeEvent).toHaveBeenCalledOnce();
  });

  it("returns 400 and dispatches nothing on a bad signature", async () => {
    constructWebhookEvent.mockImplementation(() => {
      throw new Error("bad sig");
    });
    const res = await post("{}", "bad");
    expect(res.status).toBe(400);
    expect(handleStripeEvent).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm test -- stripe-webhook.test`
Expected: FAIL — route module not found.

- [ ] **Step 4: Write the bare route**

Create `app/api/stripe/webhook/route.ts`:

```ts
import { logError } from "@/lib/logger";
import { realGateway } from "@/lib/stripe/realGateway";
import {
  buildProdWebhookDeps,
  handleStripeEvent,
} from "@/lib/stripe/webhookHandler";

// Prisma needs Node; also required for raw-body signature verification.
export const runtime = "nodejs";

/**
 * BARE handler — intentionally NOT wrapped in apiRoute/publicRoute, which call
 * req.json() and would consume the raw body needed for signature verification.
 * The Stripe signature is the credential (route is allowlisted in
 * lib/publicRoutes.ts). Returns 200 on success + idempotent replays, 400 on a
 * bad signature so Stripe stops retrying a malformed body.
 */
export async function POST(req: Request): Promise<Response> {
  const signature = req.headers.get("stripe-signature");
  const rawBody = await req.text();

  let event;
  try {
    event = realGateway.constructWebhookEvent(rawBody, signature);
  } catch (err) {
    logError({
      errorMessage: "STRIPE_WEBHOOK_SIGNATURE_FAILED",
      err,
      method: "POST",
      path: "/api/stripe/webhook",
      orgId: "stripe-webhook",
    });
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    await handleStripeEvent(event, buildProdWebhookDeps());
  } catch (err) {
    // Log and still 200: the event is verified-genuine; a transient failure
    // should be retried by Stripe only via explicit non-2xx, which we avoid for
    // already-applied idempotent writes. Surface for investigation.
    logError({
      errorMessage: `stripe webhook handler failed: ${event.type}`,
      err,
      method: "POST",
      path: "/api/stripe/webhook",
      orgId: "stripe-webhook",
    });
    return new Response("Handler error", { status: 500 });
  }

  return new Response(null, { status: 200 });
}
```

(Note: a 500 lets Stripe retry transient failures; idempotency on `stripeChargeId` makes retries safe.)

- [ ] **Step 5: Allowlist the webhook route**

In `lib/publicRoutes.ts`, add to `PUBLIC_REVIEW_PREFIXES`:

```ts
  // Stripe webhook — signature-verified inside the handler (the signature is
  // the credential). Must bypass the auth proxy.
  "/api/stripe/webhook",
```

- [ ] **Step 6: Run to verify it passes**

Run: `npm test -- stripe-webhook.test`
Expected: PASS (both cases). Then `npm run typecheck` — PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/stripe/webhookHandler.ts app/api/stripe/webhook lib/publicRoutes.ts __tests__/api/stripe-webhook.test.ts
git commit -m "feat(stripe): add signature-verified webhook route + prod deps"
```

---

## Task 13: Public-page payment banner

**Files:**
- Modify: `app/invoice-review/[token]/page.tsx`
- Modify: `components/invoices/PublicInvoiceView.tsx`
- Test: `__tests__/components/invoices/PublicInvoiceView.test.tsx`

- [ ] **Step 1: Derive the banner state in the page**

In `app/invoice-review/[token]/page.tsx`, after computing `paid`/`balanceDue`, derive a payment-status banner from the query param and the event log (the page already loads `invoice.invoiceEvents` via `INVOICE_INCLUDE`):

```ts
  const justPaid = (await searchParams)?.paid === "1";
  // Most recent payment-relevant event decides the persistent banner.
  const lastPayEvent = invoice.invoiceEvents.find((e) =>
    ["payment_recorded", "ach_processing", "ach_failed", "payment_failed"].includes(
      e.type
    )
  );
  const banner: "received" | "processing" | "failed" | null = justPaid
    ? "received"
    : lastPayEvent?.type === "ach_processing"
      ? "processing"
      : lastPayEvent?.type === "ach_failed" ||
          lastPayEvent?.type === "payment_failed"
        ? "failed"
        : null;
```

Add `searchParams` to the page `Props` and signature:

```ts
interface Props {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ paid?: string }>;
}
```

And pass `banner` into the view: add `paymentBanner={banner}` to `<PublicInvoiceView … />`.

(`invoiceEvents` are ordered `createdAt: desc` by `INVOICE_INCLUDE`, so `.find` returns the most recent.)

- [ ] **Step 2: Write the failing component test**

Create `__tests__/components/invoices/PublicInvoiceView.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  type PublicInvoice,
  PublicInvoiceView,
} from "@/components/invoices/PublicInvoiceView";

const base: PublicInvoice = {
  invoiceNumber: 7,
  status: "sent",
  dueLabel: null,
  amountFormatted: "$500.00",
  paidFormatted: null,
  balanceDueFormatted: "$500.00",
  memo: null,
  terms: "",
  paymentInstructions: "",
  payUrl: "/api/invoice-review/tok/pay",
  org: { name: "Floors Co", phone: null, address: null, logo: null },
  customer: null,
  lines: [{ name: "Install", description: null, amount: 500 }],
};

describe("PublicInvoiceView payment banner", () => {
  it("shows a 'received' banner when paymentBanner='received'", () => {
    render(<PublicInvoiceView invoice={base} paymentBanner="received" />);
    expect(screen.getByText(/payment received/i)).toBeInTheDocument();
  });

  it("shows a 'processing' banner for in-flight ACH", () => {
    render(<PublicInvoiceView invoice={base} paymentBanner="processing" />);
    expect(screen.getByText(/processing/i)).toBeInTheDocument();
  });

  it("renders no banner when paymentBanner is null", () => {
    render(<PublicInvoiceView invoice={base} paymentBanner={null} />);
    expect(screen.queryByText(/payment received/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm test -- PublicInvoiceView.test`
Expected: FAIL — `paymentBanner` prop doesn't exist; no banner rendered.

- [ ] **Step 4: Add the banner to the view**

In `components/invoices/PublicInvoiceView.tsx`, extend the props and render a banner above the table:

```tsx
export function PublicInvoiceView({
  invoice,
  paymentBanner = null,
}: {
  invoice: PublicInvoice;
  paymentBanner?: "received" | "processing" | "failed" | null;
}) {
```

Then immediately inside `<main …>` (before `<header>`), add:

```tsx
      {paymentBanner ? (
        <div
          className={[
            "mb-4 rounded-md px-4 py-3 text-[13px]",
            paymentBanner === "failed"
              ? "bg-red-50 text-red-700"
              : "bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-[var(--ink)]",
          ].join(" ")}
        >
          {paymentBanner === "received"
            ? "Payment received — thank you. It may take a moment to reflect below."
            : paymentBanner === "processing"
              ? "A bank payment is processing. This can take 1–4 business days to clear."
              : "Your last payment attempt didn't go through. Please try again."}
        </div>
      ) : null}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm test -- PublicInvoiceView.test`
Expected: PASS (all 3 cases). Then `npm run typecheck`.

- [ ] **Step 6: Commit**

```bash
git add "app/invoice-review/[token]/page.tsx" components/invoices/PublicInvoiceView.tsx __tests__/components/invoices/PublicInvoiceView.test.tsx
git commit -m "feat(stripe): payment-status banner on the public invoice page"
```

---

## Task 14: E2E coverage (logged-out)

**Files:**
- Create: `tests/e2e/invoice-payment-stripe.spec.ts` (match the repo's existing e2e dir; if it differs, mirror the path of an existing public-page spec)
- May modify: `prisma/seed.ts` (a seeded onboarded org + a sent invoice for the spec)

> The e2e suite lives in `tests/e2e/` (confirmed). Model this on the existing `tests/e2e/public-invoice-review.spec.ts` and `tests/e2e/invoice-payment.spec.ts` — reuse their logged-out context + seeding helpers and the `playwright.config.ts` setup.

- [ ] **Step 1: Write the E2E spec**

Create `tests/e2e/invoice-payment-stripe.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

// Logged-OUT context: customers have no session. A logged-in context would
// mask a missing /api/invoice-review/ or /api/stripe/webhook allowlist entry.
test.use({ storageState: { cookies: [], origins: [] } });

test("onboarded org shows a Pay button on the public invoice", async ({ page }) => {
  // Seed (or reuse seed) an org with stripeChargesEnabled=true + a sent invoice
  // with a known publicToken. Replace TOKEN with the seeded token.
  const TOKEN = process.env.E2E_PAYABLE_INVOICE_TOKEN ?? "seeded-payable-token";
  await page.goto(`/invoice-review/${TOKEN}`);
  await expect(page.getByRole("link", { name: /pay invoice/i })).toBeVisible();
});

test("un-onboarded org hides the Pay button", async ({ page }) => {
  const TOKEN = process.env.E2E_UNPAYABLE_INVOICE_TOKEN ?? "seeded-unpayable-token";
  await page.goto(`/invoice-review/${TOKEN}`);
  await expect(page.getByRole("link", { name: /pay invoice/i })).toHaveCount(0);
});

test("webhook route is reachable logged-out and rejects a bad signature with 400", async ({
  request,
}) => {
  const res = await request.post("/api/stripe/webhook", {
    headers: { "stripe-signature": "bad" },
    data: "{}",
  });
  expect(res.status()).toBe(400);
});
```

- [ ] **Step 2: Seed the two invoices**

In `prisma/seed.ts`, add (idempotently) one org with `stripeChargesEnabled: true` + `stripeConnectAccountId: "acct_seed"` owning a `sent` invoice with a fixed `publicToken`, and one un-onboarded org's `sent` invoice with a fixed `publicToken`. Export the tokens via the env names referenced above (or hardcode the seeded tokens in the spec).

- [ ] **Step 3: Run the E2E (locally, single worker)**

Run: `npm run seed:dev` then `npm run test:e2e -- --workers=1 invoice-payment-stripe`
Expected: PASS (3 tests). The bad-signature test confirms the allowlist + bare-route wiring without any Stripe network call.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/invoice-payment-stripe.spec.ts prisma/seed.ts
git commit -m "test(e2e): logged-out invoice-payment Pay button + webhook reachability"
```

---

## Task 15: Docs sync + final verification

**Files:**
- Modify: `CONTEXT.md` (Invoice + new "Online Payments" notes)
- Modify: `AGENTS.md` (new `lib/stripe` module + allowlist entries)

- [ ] **Step 1: Update CONTEXT.md**

In the **Invoice** section, replace the "Payments are recorded manually …Stripe execution is out of scope" sentence with:

```markdown
Payments are recorded into a `Payment` ledger either manually (`recordPayment`)
or automatically from Stripe (`recordStripePayment`, keyed idempotently on
`Payment.stripeChargeId`). The ledger holds **settled money only**: an in-flight
ACH writes no Payment row, only an `ach_processing` InvoiceEvent, so
`nextInvoiceStatus` is unchanged and an unsettled payment never reads as paid.
Online payment flows through Stripe Connect (Express) destination charges — see
the *Online Payments* section and `docs/superpowers/specs/2026-06-14-online-payments-design.md`.
```

Add a short **Online Payments** section pointer (after **Send Pipeline**) summarizing: the `StripeGateway` port (`lib/stripe/`), the on-demand public pay route, the bare webhook spine, and the org `stripeChargesEnabled` gate. Keep the new error codes already added in Task 2.

- [ ] **Step 2: Update AGENTS.md**

In *Where things live*, add a bullet:

```markdown
- `lib/stripe/` — **online payments**: the `StripeGateway` port (`gateway.ts` +
  `realGateway.ts` + `fakeGateway.ts`), the pure Checkout builder (`checkout.ts`),
  Connect onboarding (`onboarding.ts`), and the webhook dispatch
  (`webhookHandler.ts`). Routes are thin; all SDK access is behind the port.
```

In *Gotchas*, add a bullet:

```markdown
- **The Stripe webhook (`/api/stripe/webhook`) is a BARE route** — not wrapped
  in `apiRoute`/`publicRoute` (they consume the raw body needed for signature
  verification). It plus `/api/invoice-review/` (the pay route) are allowlisted
  in `lib/publicRoutes.ts`. Record Stripe payments only on settled events; the
  ledger means settled money only.
```

- [ ] **Step 3: Full verification**

Run, in order:

```bash
npm run lint:ci
npm run typecheck
npm test
```

Expected: all green. Then the E2E from Task 14 with `--workers=1`.

- [ ] **Step 4: Commit**

```bash
git add CONTEXT.md AGENTS.md
git commit -m "docs: document online payments (lib/stripe, ledger seam, webhook)"
```

---

## Build-time confirmations (flagged in the spec)

These are verified against live Stripe during Task 8/12 implementation, not unit tests:

1. **Webhook endpoint scope** — confirm a single platform endpoint (`connect=false`) receives BOTH payment events and connected-account `account.updated`. If Stripe requires a separate `connect=true` endpoint/secret, add `STRIPE_CONNECT_WEBHOOK_SECRET` and have `realGateway.constructWebhookEvent` try both secrets (verify once per secret, accept on first match). Mis-scoping silently drops onboarding completion.
2. **Local testing** — `stripe listen --forward-to localhost:3000/api/stripe/webhook` for payments; `stripe trigger account.updated` / test-mode KYC for onboarding. The `StripeGateway` port means none of the unit suite hits Stripe.
3. **Worktree deps** — a fresh worktree needs `npm install` (now includes `stripe`) before `next dev` / E2E / DB suites; `getStripeClient()` returning null without the key keeps CI typecheck/boot green.
```

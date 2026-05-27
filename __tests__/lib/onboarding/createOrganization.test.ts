import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EmailTakenError } from "@/lib/api/errors";
import { OnboardingError, SlugExhaustedError } from "@/lib/onboarding/errors";

/**
 * Tests for lib/onboarding/createOrganization.
 *
 * The service runs in a single Prisma transaction. We mock the transaction
 * client to record what the service tries to write, and to simulate
 * collisions and failures. We mock the top-level prisma object too so that
 * any pre-transaction lookups (e.g. slug existence check) can be tracked.
 */

const orgCreate = vi.fn();
const userCreate = vi.fn();
const templateCreateMany = vi.fn();
const orgFindUnique = vi.fn();
const userFindUnique = vi.fn();

// $transaction receives a callback and we invoke it with a fake tx client.
const txClient = {
  organization: {
    create: orgCreate,
    findUnique: orgFindUnique,
  },
  user: {
    create: userCreate,
    findUnique: userFindUnique,
  },
  lineItemTemplate: {
    createMany: templateCreateMany,
  },
};

const $transaction = vi.fn(async (cb: (tx: typeof txClient) => unknown) => {
  return cb(txClient);
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction,
    organization: { findUnique: orgFindUnique },
    user: { findUnique: userFindUnique },
  },
}));

const { createOrganization } = await import(
  "@/lib/onboarding/createOrganization"
);

beforeEach(() => {
  vi.clearAllMocks();
  orgFindUnique.mockResolvedValue(null);
  userFindUnique.mockResolvedValue(null);
  orgCreate.mockResolvedValue({ id: "org-new", slug: "acme" });
  userCreate.mockResolvedValue({ id: "user-new" });
  templateCreateMany.mockResolvedValue({ count: 6 });
});

describe("createOrganization (happy path)", () => {
  it("creates org + admin user + templates in a single transaction", async () => {
    const result = await createOrganization({
      org: { name: "Acme Floors" },
      admin: {
        name: "Alex Admin",
        email: "alex@acme.test",
        password: "supersecret1",
      },
      billing: { kind: "manual" },
    });

    expect($transaction).toHaveBeenCalledTimes(1);
    expect(orgCreate).toHaveBeenCalledTimes(1);
    expect(userCreate).toHaveBeenCalledTimes(1);
    expect(templateCreateMany).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      orgId: "org-new",
      adminUserId: "user-new",
      slug: "acme",
    });
  });
});

describe("createOrganization (billing fields)", () => {
  it("manual billing sets subscriptionStatus='manual' and null Stripe ids", async () => {
    await createOrganization({
      org: { name: "Acme Floors" },
      admin: { name: "A", email: "a@x.test", password: "supersecret1" },
      billing: { kind: "manual" },
    });
    expect(orgCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subscriptionStatus: "manual",
          stripeCustomerId: null,
          stripeSubscriptionId: null,
          trialEndsAt: null,
          currentPeriodEndsAt: null,
        }),
      })
    );
  });

  it("stripe billing populates all Stripe fields verbatim", async () => {
    const trialEnd = new Date("2026-06-08T00:00:00Z");
    const periodEnd = new Date("2026-07-08T00:00:00Z");
    await createOrganization({
      org: { name: "Acme Floors" },
      admin: { name: "A", email: "b@x.test", password: "supersecret1" },
      billing: {
        kind: "stripe",
        customerId: "cus_123",
        subscriptionId: "sub_123",
        status: "trialing",
        trialEndsAt: trialEnd,
        currentPeriodEndsAt: periodEnd,
      },
    });
    expect(orgCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subscriptionStatus: "trialing",
          stripeCustomerId: "cus_123",
          stripeSubscriptionId: "sub_123",
          trialEndsAt: trialEnd,
          currentPeriodEndsAt: periodEnd,
        }),
      })
    );
  });
});

describe("createOrganization (admin user)", () => {
  it("creates the admin with role='admin' and lowercases the email", async () => {
    await createOrganization({
      org: { name: "Acme Floors" },
      admin: {
        name: "A",
        email: "Mixed.Case@Example.COM",
        password: "supersecret1",
      },
      billing: { kind: "manual" },
    });
    expect(userCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          role: "admin",
          email: "mixed.case@example.com",
        }),
      })
    );
  });

  it("bcrypts plaintext passwords", async () => {
    await createOrganization({
      org: { name: "Acme Floors" },
      admin: { name: "A", email: "c@x.test", password: "supersecret1" },
      billing: { kind: "manual" },
    });
    const data = userCreate.mock.calls[0]?.[0]?.data as { password: string };
    expect(data.password.startsWith("$2")).toBe(true);
    expect(bcrypt.compareSync("supersecret1", data.password)).toBe(true);
  });

  it("passes already-bcrypted hashes through unchanged", async () => {
    const pre = await bcrypt.hash("anything", 10);
    await createOrganization({
      org: { name: "Acme Floors" },
      admin: { name: "A", email: "d@x.test", password: pre },
      billing: { kind: "manual" },
    });
    const data = userCreate.mock.calls[0]?.[0]?.data as { password: string };
    expect(data.password).toBe(pre);
  });
});

describe("createOrganization (default content)", () => {
  it("seeds the 6 default line-item templates by default", async () => {
    await createOrganization({
      org: { name: "Acme Floors" },
      admin: { name: "A", email: "e@x.test", password: "supersecret1" },
      billing: { kind: "manual" },
    });
    expect(templateCreateMany).toHaveBeenCalledTimes(1);
    const arg = templateCreateMany.mock.calls[0]?.[0] as {
      data: Array<{ name: string; orgId: string }>;
    };
    expect(arg.data).toHaveLength(6);
    expect(arg.data.every((t) => t.orgId === "org-new")).toBe(true);
    expect(arg.data[0]?.name).toBe("LVP — Mohawk RevWood");
  });

  it("seed: 'none' skips template creation", async () => {
    await createOrganization({
      org: { name: "Acme Floors" },
      admin: { name: "A", email: "f@x.test", password: "supersecret1" },
      billing: { kind: "manual" },
      seed: "none",
    });
    expect(templateCreateMany).not.toHaveBeenCalled();
  });
});

describe("createOrganization (slug handling)", () => {
  it("derives slug from name when not provided", async () => {
    await createOrganization({
      org: { name: "Pinecrest Flooring Co." },
      admin: { name: "A", email: "g@x.test", password: "supersecret1" },
      billing: { kind: "manual" },
    });
    expect(orgCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ slug: "pinecrest-flooring-co" }),
      })
    );
  });

  it("uses the supplied slug verbatim when present", async () => {
    await createOrganization({
      org: { name: "Pinecrest Flooring Co.", slug: "custom-slug" },
      admin: { name: "A", email: "h@x.test", password: "supersecret1" },
      billing: { kind: "manual" },
    });
    expect(orgCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ slug: "custom-slug" }),
      })
    );
  });

  it("appends -2 on first slug collision, -3 on second, etc.", async () => {
    // Pretend "acme" and "acme-2" exist; "acme-3" is free.
    orgFindUnique
      .mockResolvedValueOnce({ id: "exists-1" })
      .mockResolvedValueOnce({ id: "exists-2" })
      .mockResolvedValueOnce(null);

    await createOrganization({
      org: { name: "Acme" },
      admin: { name: "A", email: "i@x.test", password: "supersecret1" },
      billing: { kind: "manual" },
    });
    expect(orgCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ slug: "acme-3" }),
      })
    );
  });

  it("throws SlugExhaustedError after 20 attempts", async () => {
    orgFindUnique.mockResolvedValue({ id: "exists" }); // every check finds a collision
    await expect(
      createOrganization({
        org: { name: "Acme" },
        admin: { name: "A", email: "j@x.test", password: "supersecret1" },
        billing: { kind: "manual" },
      })
    ).rejects.toBeInstanceOf(SlugExhaustedError);
  });
});

describe("createOrganization (email uniqueness)", () => {
  it("throws EmailTakenError when admin email already exists", async () => {
    userFindUnique.mockResolvedValueOnce({ id: "existing-user" });
    await expect(
      createOrganization({
        org: { name: "Acme Floors" },
        admin: { name: "A", email: "taken@x.test", password: "supersecret1" },
        billing: { kind: "manual" },
      })
    ).rejects.toBeInstanceOf(EmailTakenError);
    expect($transaction).not.toHaveBeenCalled();
  });
});

describe("createOrganization (rollback)", () => {
  it("wraps unexpected errors in OnboardingError", async () => {
    templateCreateMany.mockRejectedValueOnce(new Error("disk full"));
    await expect(
      createOrganization({
        org: { name: "Acme Floors" },
        admin: { name: "A", email: "k@x.test", password: "supersecret1" },
        billing: { kind: "manual" },
      })
    ).rejects.toBeInstanceOf(OnboardingError);
  });

  it("rethrows Prisma P2002 on email as EmailTakenError", async () => {
    // Simulate a race: pre-flight check passes, transaction-time write hits
    // the User.email unique index.
    userFindUnique.mockResolvedValueOnce(null);
    const p2002 = Object.assign(new Error("Unique constraint"), {
      code: "P2002",
      meta: { target: ["email"] },
    });
    userCreate.mockRejectedValueOnce(p2002);
    await expect(
      createOrganization({
        org: { name: "Acme Floors" },
        admin: { name: "A", email: "l@x.test", password: "supersecret1" },
        billing: { kind: "manual" },
      })
    ).rejects.toBeInstanceOf(EmailTakenError);
  });
});

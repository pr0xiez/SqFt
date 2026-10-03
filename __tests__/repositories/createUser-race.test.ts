import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for lib/repositories/userRepo#createUser's P2002 handling.
 *
 * Callers (app/api/users, app/api/admin/orgs/[orgId]/users) pre-flight-check
 * email uniqueness via findByEmail, but that check is racy under concurrency
 * (issue #230): two requests can both pass the pre-flight and race to
 * insert, and the loser hits the User.email unique index. createUser must
 * catch that Prisma P2002 and map it to a generic USER_CREATE_FAILED conflict
 * instead of letting it surface as a generic 500.
 */

const userCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { create: userCreate } },
}));

const { createUser } = await import("@/lib/repositories/userRepo");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createUser (email race)", () => {
  it("maps Prisma P2002 on email to a generic USER_CREATE_FAILED conflict", async () => {
    const p2002 = Object.assign(new Error("Unique constraint failed"), {
      code: "P2002",
      meta: { target: ["email"] },
    });
    userCreate.mockRejectedValueOnce(p2002);

    await expect(
      createUser("org1", {
        name: "Jane",
        email: "dup@test.dev",
        role: "crew",
        password: "hashed",
      })
    ).rejects.toMatchObject({ code: "USER_CREATE_FAILED", status: 409 });
  });

  it("propagates non-P2002 errors unchanged", async () => {
    const dbError = new Error("connection reset");
    userCreate.mockRejectedValueOnce(dbError);

    await expect(
      createUser("org1", {
        name: "Jane",
        email: "jane@test.dev",
        role: "crew",
        password: "hashed",
      })
    ).rejects.toBe(dbError);
  });

  it("resolves normally on success", async () => {
    const created = {
      id: "u1",
      name: "Jane",
      email: "jane@test.dev",
      role: "crew",
      title: null,
      archived: false,
      createdAt: new Date(),
    };
    userCreate.mockResolvedValueOnce(created);

    await expect(
      createUser("org1", {
        name: "Jane",
        email: "jane@test.dev",
        role: "crew",
        password: "hashed",
      })
    ).resolves.toEqual(created);
  });
});

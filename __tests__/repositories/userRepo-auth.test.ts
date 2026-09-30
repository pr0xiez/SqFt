import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
const count = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique, count },
  },
}));

const { countUsersForAdmin } = await import("@/lib/repositories/userRepo");

const { findCredentialsUser } = await import("@/lib/repositories/loginRepo");

beforeEach(() => vi.clearAllMocks());

describe("findCredentialsUser", () => {
  it("returns null when no user matches the email", async () => {
    findUnique.mockResolvedValue(null);
    expect(await findCredentialsUser("nobody@example.com")).toBeNull();
  });

  it("looks up by email (not org-scoped — login precedes knowing the org) and includes the password hash", async () => {
    const row = {
      id: "u1",
      name: "Ada",
      email: "ada@example.com",
      password: "$2a$10$hashedvalue",
      orgId: "org1",
      role: "admin",
      archived: false,
    };
    findUnique.mockResolvedValue(row);
    const result = await findCredentialsUser("ada@example.com");
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: "ada@example.com" } })
    );
    expect(result).toEqual(row);
  });
});

describe("countUsersForAdmin", () => {
  it("returns the platform-wide user count with no where filter", async () => {
    count.mockResolvedValue(42);
    expect(await countUsersForAdmin()).toBe(42);
    expect(count).toHaveBeenCalledWith();
  });
});

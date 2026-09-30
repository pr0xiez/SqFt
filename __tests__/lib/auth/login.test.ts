import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/repositories/loginRepo", () => ({
  findCredentialsUser: vi.fn(),
  recordFailedLogin: vi.fn(),
  clearLoginFailures: vi.fn(),
}));

import {
  authenticateCredentials,
  LOCKOUT_WINDOW_MS,
  MAX_FAILED_LOGIN_ATTEMPTS,
} from "@/lib/auth/login";
import {
  clearLoginFailures,
  findCredentialsUser,
  recordFailedLogin,
} from "@/lib/repositories/loginRepo";

const find = vi.mocked(findCredentialsUser);
const fail = vi.mocked(recordFailedLogin);
const clear = vi.mocked(clearLoginFailures);
const PASSWORD = "correct horse battery staple";
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 10);

const user = {
  id: "u1",
  name: "Ada",
  email: "ada@example.dev",
  password: PASSWORD_HASH,
  orgId: "org1",
  role: "admin",
  archived: false,
  failedLoginCount: 0,
  lockedUntil: null,
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  clear.mockResolvedValue({ count: 1 });
});

describe("authenticateCredentials", () => {
  it.each([
    "unknown",
    "archived",
    "locked",
  ])("rejects %s users after paying a dummy bcrypt comparison", async (kind) => {
    find.mockResolvedValue(
      kind === "unknown"
        ? null
        : {
            ...user,
            archived: kind === "archived",
            lockedUntil:
              kind === "locked"
                ? new Date(Date.now() + LOCKOUT_WINDOW_MS)
                : null,
          }
    );
    const compare = vi.spyOn(bcrypt, "compare");
    expect(await authenticateCredentials(user.email, PASSWORD)).toBeNull();
    expect(compare).toHaveBeenCalledTimes(1);
    expect(compare.mock.calls[0]?.[1]).not.toBe(PASSWORD_HASH);
    expect(fail).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
  });

  it("returns the authenticated identity with clean counters without a reset write", async () => {
    find.mockResolvedValue(user);
    expect(await authenticateCredentials(user.email, PASSWORD)).toEqual({
      id: user.id,
      name: user.name,
      email: user.email,
      orgId: user.orgId,
      role: user.role,
    });
    expect(clear).not.toHaveBeenCalled();
  });

  it("records a wrong password through the atomic repository operation", async () => {
    find.mockResolvedValue({ ...user, failedLoginCount: 4 });
    expect(
      await authenticateCredentials(user.email, "wrong-password")
    ).toBeNull();
    expect(fail).toHaveBeenCalledWith(
      user.id,
      expect.any(Date),
      MAX_FAILED_LOGIN_ATTEMPTS,
      LOCKOUT_WINDOW_MS
    );
  });

  it("allows a wrong password after lock expiry to start a fresh repository budget", async () => {
    find.mockResolvedValue({
      ...user,
      failedLoginCount: 5,
      lockedUntil: new Date(Date.now() - 1000),
    });
    expect(
      await authenticateCredentials(user.email, "wrong-password")
    ).toBeNull();
    expect(fail).toHaveBeenCalledTimes(1);
  });

  it("clears failures after a successful retry", async () => {
    find.mockResolvedValue({
      ...user,
      failedLoginCount: 5,
      lockedUntil: new Date(Date.now() - 1000),
    });
    expect(await authenticateCredentials(user.email, PASSWORD)).not.toBeNull();
    expect(clear).toHaveBeenCalledWith(user.id);
  });

  it("rejects a dirty account archived during the password comparison", async () => {
    find.mockResolvedValue({ ...user, failedLoginCount: 1 });
    clear.mockResolvedValue({ count: 0 });
    expect(await authenticateCredentials(user.email, PASSWORD)).toBeNull();
  });
});

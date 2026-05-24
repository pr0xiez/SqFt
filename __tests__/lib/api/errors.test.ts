import { describe, expect, it } from "vitest";
import {
  CannotDemoteSelfError,
  EmailTakenError,
  LastAdminError,
} from "@/lib/api/errors";

describe("members error codes", () => {
  it("EmailTakenError is 409 EMAIL_TAKEN", () => {
    const err = new EmailTakenError();
    expect(err.code).toBe("EMAIL_TAKEN");
    expect(err.status).toBe(409);
  });

  it("CannotDemoteSelfError is 400 CANNOT_DEMOTE_SELF", () => {
    const err = new CannotDemoteSelfError();
    expect(err.code).toBe("CANNOT_DEMOTE_SELF");
    expect(err.status).toBe(400);
  });

  it("LastAdminError is 400 LAST_ADMIN", () => {
    const err = new LastAdminError();
    expect(err.code).toBe("LAST_ADMIN");
    expect(err.status).toBe(400);
  });
});

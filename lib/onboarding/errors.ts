/**
 * Errors raised by lib/onboarding/createOrganization. The service composes
 * `EmailTakenError` (re-used from lib/api/errors) plus the two new ones
 * defined here.
 */
import { ApiError } from "@/lib/api/errors";

export class SlugExhaustedError extends ApiError {
  constructor(baseSlug: string) {
    super({
      code: "SLUG_EXHAUSTED",
      status: 500,
      message: `Could not find an available slug derived from "${baseSlug}" within 20 attempts`,
    });
  }
}

export class OnboardingError extends ApiError {
  constructor(message: string) {
    super({ code: "ONBOARDING_FAILED", status: 500, message });
  }
}

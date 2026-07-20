"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { readApiError } from "@/lib/api/errors";

export interface StripeConnectStatus {
  connected: boolean;
  status: "pending" | "active" | "restricted" | null;
  requirements: {
    actionDue: boolean;
    inReview: boolean;
    errorReason: string | null;
  } | null;
}

/**
 * Poll cadence while waiting for Stripe's async verification. Each poll is one
 * Stripe account read server-side, so keep this comfortably under Stripe's
 * rate limits (test mode allows 25 reads/s); the settings page also caps how
 * long it polls (see PaymentsSettingsView).
 */
export const STRIPE_CONNECT_POLL_MS = 5000;

async function jsonOrThrow<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) {
    const { message } = await readApiError(res, fallback);
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export function useStripeConnect(opts?: { pollWhileVerifying?: boolean }) {
  return useQuery({
    queryKey: ["stripe-connect"],
    queryFn: async () =>
      jsonOrThrow<StripeConnectStatus>(
        await fetch("/api/org/stripe/connect"),
        "Failed to load Stripe connection status"
      ),
    // Keep refetching only while Stripe is the one we're waiting on: stop as
    // soon as the account is active, or the user has something to do.
    refetchInterval: opts?.pollWhileVerifying
      ? (query) => {
          const d = query.state.data;
          if (!d) return STRIPE_CONNECT_POLL_MS; // first load in flight
          if (!d.connected || d.status === "active") return false;
          if (d.requirements?.actionDue) return false;
          if (d.status === "restricted" && !d.requirements?.inReview)
            return false;
          return STRIPE_CONNECT_POLL_MS;
        }
      : false,
  });
}

export function useStartStripeOnboarding() {
  return useMutation({
    mutationFn: async (): Promise<{ url: string }> =>
      jsonOrThrow<{ url: string }>(
        await fetch("/api/org/stripe/connect", { method: "POST" }),
        "Failed to start Stripe onboarding"
      ),
    onSuccess: ({ url }) => {
      window.location.assign(url);
    },
  });
}

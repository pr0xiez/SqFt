"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/hooks/apiFetch";
import {
  connectPhase,
  connectPollInterval,
  type StripeConnectStatus,
} from "@/lib/stripe/connectPhase";

export type { StripeConnectStatus };

export const STRIPE_CONNECT_QUERY_KEY = ["stripe-connect"];

/**
 * The org's Stripe Connect status. `pollWindowOpenedAt` (epoch ms) is when the
 * post-onboarding poll window opened — null or omitted means no window. While
 * it is set, the query re-reads Stripe on the backoff schedule in
 * `connectPollInterval`, and only in phases that are waiting on Stripe; the
 * schedule itself runs out at the window's end, so a caller that never clears
 * the timestamp still stops polling.
 */
export function useStripeConnect(opts?: {
  pollWindowOpenedAt?: number | null;
}) {
  const openedAt = opts?.pollWindowOpenedAt ?? null;
  return useQuery({
    queryKey: STRIPE_CONNECT_QUERY_KEY,
    queryFn: () =>
      apiFetch<StripeConnectStatus>(
        "/api/org/stripe/connect",
        undefined,
        "Failed to load Stripe connection status"
      ),
    refetchInterval:
      openedAt === null
        ? false
        : (query) => {
            const data = query.state.data;
            return connectPollInterval(
              connectPhase({ data, isError: query.state.status === "error" }),
              data,
              Date.now() - openedAt
            );
          },
    // The post-onboarding poll window is wall-clock (see PaymentsSettingsView),
    // but React Query suppresses interval refetches on a hidden tab by default.
    // Without this, someone who reads "this page updates automatically" and
    // switches to their inbox — the exact thing that copy invites — comes back
    // to a window that expired having run zero polls.
    refetchIntervalInBackground: true,
  });
}

export function useStartStripeOnboarding() {
  return useMutation({
    mutationFn: () =>
      apiFetch<{ url: string }>(
        "/api/org/stripe/connect",
        { method: "POST" },
        "Failed to start Stripe onboarding"
      ),
    onSuccess: ({ url }) => {
      window.location.assign(url);
    },
  });
}

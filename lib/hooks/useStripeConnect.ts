"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { readApiError } from "@/lib/api/errors";

export interface StripeConnectStatus {
  connected: boolean;
  status: "pending" | "active" | "restricted" | null;
}

async function jsonOrThrow<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) {
    const { message } = await readApiError(res, fallback);
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export function useStripeConnect() {
  return useQuery({
    queryKey: ["stripe-connect"],
    queryFn: async () =>
      jsonOrThrow<StripeConnectStatus>(
        await fetch("/api/org/stripe/connect"),
        "Failed to load Stripe connection status"
      ),
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

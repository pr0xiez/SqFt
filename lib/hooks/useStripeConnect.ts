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

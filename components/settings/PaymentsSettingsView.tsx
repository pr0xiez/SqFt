"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Button, buttonClasses } from "@/components/ui/Button";
import {
  useStartStripeOnboarding,
  useStripeConnect,
} from "@/lib/hooks/useStripeConnect";

export function PaymentsSettingsView() {
  const qc = useQueryClient();
  const { data, isLoading } = useStripeConnect();
  const start = useStartStripeOnboarding();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const onboarding = params.get("onboarding");
    if (onboarding === "return" || onboarding === "refresh") {
      qc.invalidateQueries({ queryKey: ["stripe-connect"] });
    }
  }, [qc]);

  return (
    <div className="max-w-[760px] mx-auto px-4 py-8">
      <h1 className="text-[24px] font-[700] tracking-[-0.02em] mb-1">
        Payments
      </h1>
      <p className="text-[13px] text-[var(--muted)] mb-6">
        Connect Stripe to accept card payments from customers.
      </p>

      <div className="border border-[var(--line)] rounded-[var(--r)] bg-[var(--surface)] px-5 py-5">
        {isLoading ? (
          <p className="text-[13px] text-[var(--muted)]">Loading…</p>
        ) : data?.status === "active" ? (
          <div>
            <p className="text-[14px] font-[600] text-[var(--sage)] mb-3">
              Payments are active — customers can pay invoices online.
            </p>
            <a
              href="https://dashboard.stripe.com"
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClasses({ variant: "default", size: "sm" })}
            >
              Open Stripe dashboard ↗
            </a>
          </div>
        ) : data?.connected ? (
          <div>
            <p className="text-[14px] font-[600] mb-1">
              Finish setting up payments
            </p>
            <p className="text-[13px] text-[var(--muted)] mb-4">
              Your Stripe account isn&apos;t active yet. Complete the setup to
              start accepting card payments.
            </p>
            <Button
              variant="primary"
              size="sm"
              onClick={() => start.mutate()}
              disabled={start.isPending}
            >
              {start.isPending ? "Redirecting…" : "Continue setup"}
            </Button>
          </div>
        ) : (
          <div>
            <p className="text-[14px] font-[600] mb-1">Accept card payments</p>
            <p className="text-[13px] text-[var(--muted)] mb-4">
              Collect card payments from customers. Stripe charges a processing
              fee, deducted from your payout.
            </p>
            <Button
              variant="primary"
              size="sm"
              onClick={() => start.mutate()}
              disabled={start.isPending}
            >
              {start.isPending ? "Redirecting…" : "Set up payments"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

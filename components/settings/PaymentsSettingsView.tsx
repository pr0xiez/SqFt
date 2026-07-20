"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button, buttonClasses } from "@/components/ui/Button";
import {
  useStartStripeOnboarding,
  useStripeConnect,
} from "@/lib/hooks/useStripeConnect";

/**
 * How long the page keeps polling after returning from Stripe onboarding.
 * Test-mode verification usually settles in well under a minute; after the
 * window closes the user still has the "Check status" button.
 */
const POLL_WINDOW_MS = 2 * 60 * 1000;

export function PaymentsSettingsView() {
  const qc = useQueryClient();
  const [polling, setPolling] = useState(false);
  const { data, isLoading, isFetching, refetch } = useStripeConnect({
    pollWhileVerifying: polling,
  });
  const start = useStartStripeOnboarding();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const onboarding = params.get("onboarding");
    if (onboarding === "return" || onboarding === "refresh") {
      qc.invalidateQueries({ queryKey: ["stripe-connect"] });
      // Just back from Stripe: the account is likely mid-verification, so
      // watch it for a bounded window instead of going silent.
      setPolling(true);
      const timer = setTimeout(() => setPolling(false), POLL_WINDOW_MS);
      return () => clearTimeout(timer);
    }
  }, [qc]);

  const requirements = data?.requirements ?? null;
  const actionDue = Boolean(requirements?.actionDue);
  const inReview = Boolean(requirements?.inReview);

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
        ) : data?.connected && actionDue ? (
          <div>
            <p className="text-[14px] font-[600] mb-1">
              Stripe needs more information
            </p>
            {requirements?.errorReason ? (
              <p className="text-[13px] text-[var(--muted)] mb-2">
                {requirements.errorReason}
              </p>
            ) : null}
            <p className="text-[13px] text-[var(--muted)] mb-4">
              Continue the setup to provide what&apos;s missing — payments stay
              off until Stripe has everything it needs.
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
        ) : data?.connected && inReview ? (
          <div>
            <p className="text-[14px] font-[600] mb-1">
              Stripe is verifying your details
            </p>
            <p className="text-[13px] text-[var(--muted)] mb-4">
              Nothing to do on your end — this usually takes a minute or two.
              {polling
                ? " This page updates automatically."
                : " Use the button below to check again."}
            </p>
            <Button
              variant="default"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              {isFetching ? "Checking with Stripe…" : "Check status"}
            </Button>
          </div>
        ) : data?.connected && data.status === "restricted" ? (
          <div>
            <p className="text-[14px] font-[600] mb-1">
              Your Stripe account is restricted
            </p>
            <p className="text-[13px] text-[var(--muted)] mb-4">
              Stripe has paused payments on this account. Open the Stripe
              dashboard to see what it needs, or re-run the setup.
            </p>
            <div className="flex gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={() => start.mutate()}
                disabled={start.isPending}
              >
                {start.isPending ? "Redirecting…" : "Continue setup"}
              </Button>
              <a
                href="https://dashboard.stripe.com"
                target="_blank"
                rel="noopener noreferrer"
                className={buttonClasses({ variant: "default", size: "sm" })}
              >
                Open Stripe dashboard ↗
              </a>
            </div>
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

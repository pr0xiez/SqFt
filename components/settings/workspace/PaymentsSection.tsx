"use client";

import { useEffect, useState } from "react";
import {
  useStartStripeOnboarding,
  useStripeConnectStatus,
} from "@/lib/hooks/useStripeConnect";
import { FieldRow, SectionHead } from "./_ui";

type Props = {
  initial: {
    onboardingStatus: string;
    chargesEnabled: boolean;
    requirementsDue: string[];
  };
  /** True when returning from Stripe (?stripe=return) — poll for the webhook. */
  justReturned: boolean;
};

export function PaymentsSection({ initial, justReturned }: Props) {
  const status = useStripeConnectStatus({ enabled: justReturned });
  const start = useStartStripeOnboarding();
  const [polls, setPolls] = useState(0);

  // After returning from Stripe, refetch a few times while the account.updated
  // webhook lands (status is webhook-driven, not return-driven).
  useEffect(() => {
    if (!justReturned || polls >= 5) return;
    const t = setTimeout(() => {
      status.refetch();
      setPolls((n) => n + 1);
    }, 2000);
    return () => clearTimeout(t);
  }, [justReturned, polls, status]);

  const live = status.data ?? {
    onboardingStatus: initial.onboardingStatus,
    chargesEnabled: initial.chargesEnabled,
    requirementsDue: initial.requirementsDue,
  };

  const onConnect = async () => {
    const { url } = await start.mutateAsync();
    window.location.href = url;
  };

  const enabled = live.chargesEnabled;
  const actionNeeded = live.onboardingStatus === "action_needed";

  return (
    <section className="mb-16 scroll-mt-20" id="payments">
      <SectionHead n="04" title="Payments" kicker="Get paid online" />
      <FieldRow
        label="Online payments"
        hint="Let customers pay invoices by card or bank transfer."
      >
        {enabled ? (
          <div className="text-[14px]">
            <span className="inline-flex items-center gap-2 font-[600] text-[var(--accent)]">
              ● Connected
            </span>
            <p className="mt-1 text-[12px] text-[var(--muted)]">
              Customers can pay your invoices online. Payouts go to your
              connected bank account.
            </p>
            <button
              type="button"
              onClick={onConnect}
              disabled={start.isPending}
              className="mt-3 text-[13px] underline text-[var(--ink-2)]"
            >
              Manage in Stripe
            </button>
          </div>
        ) : (
          <div className="text-[14px]">
            {actionNeeded ? (
              <p className="mb-3 text-[13px] text-[var(--accent)]">
                Stripe needs more information before you can accept payments.
              </p>
            ) : null}
            <button
              type="button"
              onClick={onConnect}
              disabled={start.isPending}
              className="px-4 py-2 rounded-md bg-[var(--accent)] text-white font-[600] text-[13px] disabled:opacity-60"
            >
              {start.isPending
                ? "Starting…"
                : actionNeeded
                  ? "Finish setup"
                  : "Connect Stripe"}
            </button>
            {start.isError ? (
              <p className="mt-2 text-[12px] text-red-600">
                {(start.error as Error).message}
              </p>
            ) : null}
          </div>
        )}
      </FieldRow>
    </section>
  );
}

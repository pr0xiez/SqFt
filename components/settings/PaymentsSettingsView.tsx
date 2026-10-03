"use client";

import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { Button, buttonClasses } from "@/components/ui/Button";
import {
  STRIPE_CONNECT_QUERY_KEY,
  useStartStripeOnboarding,
  useStripeConnect,
} from "@/lib/hooks/useStripeConnect";
import type { ConnectRequirementIssue } from "@/lib/stripe/connect";
import {
  connectPhase,
  connectPhasePolls,
  STRIPE_CONNECT_POLL_WINDOW_MS,
} from "@/lib/stripe/connectPhase";

const STRIPE_DASHBOARD_URL = "https://dashboard.stripe.com";

function DashboardLink() {
  return (
    <a
      href={STRIPE_DASHBOARD_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={buttonClasses({ variant: "default", size: "sm" })}
    >
      Open Stripe dashboard ↗
    </a>
  );
}

function Title({ children }: { children: ReactNode }) {
  return <p className="text-[14px] font-[600] mb-1">{children}</p>;
}

function Body({ children }: { children: ReactNode }) {
  return <p className="text-[13px] text-[var(--muted)] mb-4">{children}</p>;
}

/**
 * Everything Stripe said is wrong, not just the first one. Showing a single
 * reason sends people round the onboarding loop once per problem, and which
 * one they saw depended on the (undocumented) order Stripe returned entries in.
 */
function IssueList({ issues }: { issues: ConnectRequirementIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <ul className="text-[13px] text-[var(--muted)] mb-3 pl-4 list-disc space-y-1">
      {issues.map((issue) => (
        <li key={`${issue.requirement ?? ""}|${issue.message}`}>
          {issue.message}
          {issue.requirement ? (
            <span className="ml-1 font-[var(--font-mono)] text-[11px] opacity-70">
              ({issue.requirement})
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function PaymentsSettingsView() {
  const qc = useQueryClient();
  // When the post-onboarding poll window opened (epoch ms); null when closed.
  // The hook polls on the backoff schedule in `connectPollInterval` while this
  // is set; clearing it at the window's end is what flips the copy back.
  const [pollWindowOpenedAt, setPollWindowOpenedAt] = useState<number | null>(
    null
  );
  // Tracks the MANUAL check only. `isFetching` is also true for every
  // background poll, so using it here disabled the button on every tick —
  // silently dropping clicks and blurring it out from under keyboard users.
  const [checking, setChecking] = useState(false);
  const { data, isError, refetch } = useStripeConnect({ pollWindowOpenedAt });
  const start = useStartStripeOnboarding();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const onboarding = params.get("onboarding");
    if (onboarding !== "return" && onboarding !== "refresh") return;

    // Consume the flag. Leaving it in the URL re-armed a fresh ten-minute
    // polling window — and dozens more live Stripe reads — on every reload or
    // back navigation to this page, forever.
    params.delete("onboarding");
    const qs = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${qs ? `?${qs}` : ""}`
    );

    qc.invalidateQueries({ queryKey: STRIPE_CONNECT_QUERY_KEY });

    // `refresh` means Stripe's link expired before onboarding finished: nothing
    // is being verified, and nothing can change until a new link is minted, so
    // there is nothing to watch for. Only `return` opens a polling window.
    if (onboarding !== "return") return;
    setPollWindowOpenedAt(Date.now());
  }, [qc]);

  // Close the window at its end. Its own effect, keyed on the window rather
  // than on the URL flag: the flag is consumed on first sight, so a timer owned
  // by the effect above was cancelled by Strict Mode's dev-only remount and
  // never re-armed, leaving the window open for good.
  useEffect(() => {
    if (pollWindowOpenedAt === null) return;
    const remaining =
      pollWindowOpenedAt + STRIPE_CONNECT_POLL_WINDOW_MS - Date.now();
    const timer = setTimeout(
      () => setPollWindowOpenedAt(null),
      Math.max(0, remaining)
    );
    return () => clearTimeout(timer);
  }, [pollWindowOpenedAt]);

  const checkNow = useCallback(async () => {
    setChecking(true);
    try {
      await refetch();
    } finally {
      setChecking(false);
    }
  }, [refetch]);

  const phase = connectPhase({ data, isError });
  const issues = data?.requirements?.issues ?? [];
  // Only promise self-updating copy when a poll is genuinely scheduled: the
  // window can still be open in a phase that has nothing to watch for.
  const autoUpdating =
    pollWindowOpenedAt !== null && connectPhasePolls(phase, data);

  const setupButton = (label: string) => (
    <Button
      variant="primary"
      size="sm"
      onClick={() => start.mutate()}
      disabled={start.isPending}
    >
      {start.isPending ? "Redirecting…" : label}
    </Button>
  );

  const checkButton = (
    <Button variant="default" size="sm" onClick={checkNow} disabled={checking}>
      {checking ? "Checking with Stripe…" : "Check status"}
    </Button>
  );

  const updateNote = autoUpdating
    ? " This page updates automatically."
    : " Use the button below to check again.";

  function card(): ReactNode {
    switch (phase) {
      case "loading":
        return <p className="text-[13px] text-[var(--muted)]">Loading…</p>;

      case "error":
        return (
          <div>
            <Title>Couldn&apos;t load your payment status</Title>
            <Body>
              We couldn&apos;t reach Stripe just now. Nothing about your setup
              has changed — try again in a moment.
            </Body>
            {checkButton}
          </div>
        );

      case "active":
        return (
          <div>
            <p className="text-[14px] font-[600] text-[var(--sage)] mb-3">
              Payments are active — customers can pay invoices online.
            </p>
            <DashboardLink />
          </div>
        );

      case "unsupported":
        return (
          <div>
            <Title>Stripe can&apos;t enable payments for this account</Title>
            <Body>
              Stripe doesn&apos;t support this business type, country or entity
              for online payments. Re-running the setup won&apos;t change that —
              open the Stripe dashboard for the details.
            </Body>
            <DashboardLink />
          </div>
        );

      // Only an account that was active before lands here (a never-active one
      // gets the onboarding cards; see connectPhase). Its payments are PAUSED,
      // and the dashboard link is the only way to find out why. One Stripe
      // happens to be re-reviewing is still a restricted account — and then
      // the copy points at "the button below", so Check status must be here.
      case "restricted": {
        const inReview = data?.requirements?.inReview === true;
        return (
          <div>
            <Title>Your Stripe account is restricted</Title>
            <IssueList issues={issues} />
            <Body>
              Stripe has paused payments on this account, so customers
              can&apos;t pay invoices online right now. Open the Stripe
              dashboard to see what it needs, or re-run the setup.
              {inReview
                ? ` Stripe is still reviewing what you submitted.${updateNote}`
                : ""}
            </Body>
            <div className="flex flex-wrap gap-2">
              {setupButton("Continue setup")}
              {inReview ? checkButton : null}
              <DashboardLink />
            </div>
          </div>
        );
      }

      case "action-due":
        return (
          <div>
            <Title>Stripe needs more information</Title>
            <IssueList issues={issues} />
            <Body>
              Continue the setup to provide what&apos;s missing — payments stay
              off until Stripe has everything it needs.
            </Body>
            {setupButton("Continue setup")}
          </div>
        );

      case "in-review":
        return (
          <div>
            <Title>Stripe is verifying your details</Title>
            <IssueList issues={issues} />
            <Body>
              {issues.length > 0
                ? "Stripe ran into a problem with what you submitted and is still working on it. If it doesn't clear, re-run the setup and provide it again."
                : "Nothing to do on your end. Stripe usually finishes within a few minutes, though identity checks can take longer."}
              {updateNote}
            </Body>
            <div className="flex gap-2">
              {checkButton}
              {issues.length > 0 ? setupButton("Re-run setup") : null}
            </div>
          </div>
        );

      case "incomplete":
        return (
          <div>
            <Title>Finish setting up payments</Title>
            <Body>
              Your Stripe account isn&apos;t active yet. Complete the setup to
              start accepting card payments.
            </Body>
            {setupButton("Continue setup")}
          </div>
        );

      case "not-connected":
        return (
          <div>
            <Title>Accept card payments</Title>
            <Body>
              Collect card payments from customers. Stripe charges a processing
              fee, deducted from your payout.
            </Body>
            {setupButton("Set up payments")}
          </div>
        );

      default:
        return null;
    }
  }

  return (
    <div className="max-w-[760px] mx-auto px-4 py-8">
      <h1 className="text-[24px] font-[700] tracking-[-0.02em] mb-1">
        Payments
      </h1>
      <p className="text-[13px] text-[var(--muted)] mb-6">
        Connect Stripe to accept card payments from customers.
      </p>

      {/* The card swaps itself out while polling, so announce it — otherwise a
          screen-reader user is never told the thing they were waiting for
          happened. Matches Toast / SaveBar. */}
      <div
        role="status"
        aria-live="polite"
        className="border border-[var(--line)] rounded-[var(--r)] bg-[var(--surface)] px-5 py-5"
      >
        {card()}
      </div>
    </div>
  );
}

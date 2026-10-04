"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  CheckCircleIcon,
  ClockIcon,
  type Icon,
  InfoIcon,
  WarningCircleIcon,
} from "@/components/ui/icons";

interface Props {
  token: string;
  sessionId: string;
}

type ConfirmState =
  | "checking"
  | "paid"
  | "overpaid"
  | "processing"
  | "failed"
  | "pending";

/**
 * Belt-and-suspenders reconcile: fires once on mount, POSTing the Checkout
 * Session ID to the confirm endpoint so the payment is recorded even if the
 * webhook races or is delayed.
 *
 * The confirmed banner renders ONLY after the server verifies the session is
 * paid ({ status: "paid" }). `?pay=success` and the session id are both
 * attacker-controllable on this unauthenticated page, so an unverified success
 * state must never show a "Payment received" confirmation. A failed or pending
 * verification shows a neutral finalizing message instead; the webhook remains
 * the source of truth.
 */
export function PaymentConfirm({ token, sessionId }: Props) {
  const didRun = useRef(false);
  const [state, setState] = useState<ConfirmState>("checking");

  useEffect(() => {
    if (didRun.current) return;
    didRun.current = true;
    fetch(`/api/invoice-review/${token}/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { status?: string } | null) => {
        const s = data?.status;
        setState(
          s === "paid"
            ? "paid"
            : s === "overpaid"
              ? "overpaid"
              : s === "processing"
                ? "processing"
                : s === "failed"
                  ? "failed"
                  : "pending"
        );
      })
      .catch(() => setState("pending"));
  }, [token, sessionId]);

  if (state === "paid") {
    return (
      <Banner tone="ok" icon="check">
        <span className="font-[600]">Payment received. Thank you!</span>
      </Banner>
    );
  }

  if (state === "overpaid") {
    // Money was captured but the invoice balance had already been covered (e.g.
    // a manual payment landed while this session sat open). Don't claim a clean
    // "Payment received": the contractor will refund the difference.
    return (
      <Banner tone="warn" icon="info">
        Your payment was received, but the invoice balance had already changed.
        The contractor will refund the difference.
      </Banner>
    );
  }

  if (state === "failed") {
    // A bank debit bounced: the invoice still owes its balance. Honest failure
    // copy so the homeowner knows to try again rather than waiting on a payment
    // that will never clear.
    return (
      <Banner tone="bad" icon="warning">
        Your bank payment didn&apos;t go through. Please try again.
      </Banner>
    );
  }

  if (state === "processing") {
    // Async bank debit in flight: server-verified the session is complete but
    // unsettled. Honest copy: not a confirmation, not an error.
    return (
      <Banner tone="neutral" icon="clock">
        Your bank payment is processing. This can take a few business days. The
        invoice will show as paid once it clears.
      </Banner>
    );
  }

  // Not yet verified: honest neutral state, never a false confirmation.
  return (
    <Banner tone="neutral" icon="clock">
      Finalizing your payment. This can take a moment.
    </Banner>
  );
}

const BANNER_ICONS: Record<string, Icon> = {
  check: CheckCircleIcon,
  info: InfoIcon,
  warning: WarningCircleIcon,
  clock: ClockIcon,
};

const BANNER_TONES = {
  ok: "bg-[color-mix(in_oklab,var(--ok)_12%,transparent)] text-[var(--ok)]",
  warn: "bg-[color-mix(in_oklab,var(--warn)_12%,transparent)] text-[var(--warn)]",
  bad: "bg-[var(--accent-wash)] text-[var(--accent-ink)]",
  neutral: "bg-[var(--surface-2)] text-[var(--ink-2)]",
} as const;

/** A full-width notice on the public invoice. Also used for "Payment cancelled". */
export function Banner({
  tone,
  icon,
  children,
}: {
  tone: keyof typeof BANNER_TONES;
  /** A string key, not a component, so server components can render it. */
  icon: "check" | "info" | "warning" | "clock";
  children: ReactNode;
}) {
  const BannerIcon = BANNER_ICONS[icon];
  return (
    <div
      role="status"
      className={`my-6 flex items-start gap-3 rounded-[var(--r)] px-4 py-3.5 text-[14.5px] leading-snug ${BANNER_TONES[tone]}`}
    >
      <BannerIcon aria-hidden="true" className="size-[18px] shrink-0 mt-px" />
      <p className="min-w-0">{children}</p>
    </div>
  );
}

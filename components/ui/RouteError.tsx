"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button, buttonClasses } from "@/components/ui/Button";
import { ArrowClockwiseIcon, WarningCircleIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

export type RouteErrorProps = {
  error: Error & { digest?: string };
  /** Next's `unstable_retry`: re-fetches and re-renders the segment. */
  retry: () => void;
  /** Safe route offered next to "Try again". */
  homeHref?: string;
  homeLabel?: string;
  /** Fill the viewport (root boundary) instead of sitting inside a layout. */
  fullPage?: boolean;
};

/**
 * Shared recovery UI for App Router `error.tsx` boundaries: what happened,
 * a retry, and a path back to a safe route. The error message itself is never
 * shown (server errors are redacted in production); the `digest` is, so it can
 * be matched to server logs.
 */
export function RouteError({
  error,
  retry,
  homeHref = "/",
  homeLabel = "Go to dashboard",
  fullPage = false,
}: RouteErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div
      role="alert"
      className={cn(
        "flex items-center",
        fullPage ? "min-h-[100dvh] px-6 sm:px-10" : "py-12"
      )}
    >
      <div className="max-w-[540px]">
        <p className="flex items-center gap-2 type-figure text-[14px] text-[var(--accent-ink)] mb-4">
          <WarningCircleIcon aria-hidden="true" className="size-[18px]" />
          Error
        </p>
        <h1 className="type-display text-[clamp(1.8rem,1.5rem+1.4vw,2.4rem)]">
          Something went wrong.
        </h1>
        <p className="mt-4 text-[16px] text-[var(--ink-2)] max-w-[46ch]">
          This page hit an unexpected problem. Your data is safe. Try again, and
          if it keeps happening, head back and retry from there.
        </p>
        {error.digest ? (
          <p className="mt-3 type-figure text-[13px] text-[var(--muted)]">
            Reference: {error.digest}
          </p>
        ) : null}
        <div className="mt-8 flex flex-wrap gap-3">
          <Button variant="primary" onClick={() => retry()}>
            <ArrowClockwiseIcon aria-hidden="true" />
            Try again
          </Button>
          <Link
            href={homeHref}
            className={buttonClasses({ variant: "default" })}
          >
            {homeLabel}
          </Link>
        </div>
      </div>
    </div>
  );
}

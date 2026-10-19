"use client";

import { useEffect } from "react";
import "./globals.css";

/**
 * Last resort: the root layout itself failed. This replaces it, so it brings
 * its own <html>/<body> and uses plain elements (no providers or fonts).
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-full">
        <main
          role="alert"
          className="min-h-[100dvh] flex items-center px-6 sm:px-10"
        >
          <div className="max-w-[540px]">
            <h1 className="type-display text-[clamp(1.8rem,1.5rem+1.4vw,2.4rem)]">
              Something went wrong.
            </h1>
            <p className="mt-4 text-[16px] text-[var(--ink-2)]">
              SqFt hit an unexpected problem. Your data is safe. Try again.
            </p>
            {error.digest ? (
              <p className="mt-3 type-figure text-[13px] text-[var(--muted)]">
                Reference: {error.digest}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => unstable_retry()}
              className="mt-8 h-10 px-4 rounded-[var(--r)] border border-[var(--accent)] bg-[var(--accent)] text-[var(--on-accent)] text-[14.5px] font-[600]"
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}

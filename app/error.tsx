"use client";

import { RouteError } from "@/components/ui/RouteError";

/** Root boundary: auth pages and public review pages (no app chrome). */
export default function RootError(props: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <RouteError
      error={props.error}
      retry={props.unstable_retry}
      homeHref="/"
      homeLabel="Go to SqFt"
      fullPage
    />
  );
}

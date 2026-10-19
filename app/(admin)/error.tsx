"use client";

import { RouteError } from "@/components/ui/RouteError";

/** Renders inside the group layout, so the nav stays usable after a failure. */
export default function AdminError(props: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return <RouteError error={props.error} retry={props.unstable_retry} />;
}

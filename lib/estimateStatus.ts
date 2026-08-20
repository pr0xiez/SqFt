import type { EstimateStatus } from "@/lib/hooks/useCustomers";

interface EstimateTimestamps {
  status: EstimateStatus | string;
  sentAt: string | null;
  viewedAt: string | null;
  approvedAt: string | null;
  declinedAt: string | null;
  createdAt: string;
}

export function isOpenEstimate(q: { status: string }): boolean {
  return q.status === "sent" || q.status === "viewed";
}

/**
 * An estimate is locked/terminal once the customer has approved or declined
 * it — the rule behind the `ESTIMATE_LOCKED` API error. Locked estimates can
 * no longer be edited, sent, or re-approved/declined.
 */
export function isEstimateLocked(
  status: EstimateStatus | string
): status is "approved" | "declined" {
  return status === "approved" || status === "declined";
}

export function lastTouchAt(q: EstimateTimestamps): string {
  return q.approvedAt ?? q.declinedAt ?? q.viewedAt ?? q.sentAt ?? q.createdAt;
}

export function estimateStatusTone(status: EstimateStatus | string): {
  fg: string;
  border: string;
  bg: string;
  label: string;
} {
  switch (status) {
    case "approved":
      return {
        fg: "var(--sage)",
        border: "color-mix(in srgb, var(--sage) 50%, transparent)",
        bg: "color-mix(in srgb, var(--sage) 10%, transparent)",
        label: "Approved",
      };
    case "sent":
      return {
        fg: "var(--gold)",
        border: "color-mix(in srgb, var(--gold) 45%, transparent)",
        bg: "color-mix(in srgb, var(--gold) 10%, transparent)",
        label: "Sent",
      };
    case "viewed":
      return {
        fg: "var(--gold)",
        border: "color-mix(in srgb, var(--gold) 65%, transparent)",
        bg: "color-mix(in srgb, var(--gold) 14%, transparent)",
        label: "Viewed",
      };
    case "declined":
      return {
        fg: "var(--accent)",
        border: "color-mix(in srgb, var(--accent) 45%, transparent)",
        bg: "color-mix(in srgb, var(--accent) 9%, transparent)",
        label: "Declined",
      };
    default:
      return {
        fg: "var(--muted)",
        border: "var(--line)",
        bg: "transparent",
        label: "Draft",
      };
  }
}

export function relativeTime(iso: string, now = new Date()): string {
  const then = new Date(iso);
  const ms = now.getTime() - then.getTime();
  const sec = Math.round(ms / 1000);
  if (sec < 60) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 14) return `${day}d ago`;
  const wk = Math.round(day / 7);
  if (wk < 8) return `${wk}w ago`;
  const mo = Math.round(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  const yr = Math.round(day / 365);
  return `${yr}y ago`;
}

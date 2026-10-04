import { StatusBadge } from "@/components/ui/StatusBadge";
import type { EstimateStatus } from "@/lib/estimateStatus";

interface Props {
  status: EstimateStatus;
  sentAt?: Date | string | null;
  approvedAt?: Date | string | null;
  declinedAt?: Date | string | null;
}

const fmtDate = (d: Date | string) =>
  new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

export function PublicEstimateStatusBar({
  status,
  sentAt,
  approvedAt,
  declinedAt,
}: Props) {
  let badge = <StatusBadge status="sent" label="Awaiting your response" />;
  let meta: string | null = null;

  if (status === "approved" && approvedAt) {
    badge = <StatusBadge status="approved" />;
    meta = `Approved ${fmtDate(approvedAt)}`;
  } else if (status === "declined" && declinedAt) {
    badge = <StatusBadge status="declined" />;
    meta = `Declined ${fmtDate(declinedAt)}`;
  } else if (sentAt) {
    meta = `Sent ${fmtDate(sentAt)}`;
  }

  return (
    <div className="flex items-center gap-x-3 gap-y-1 flex-wrap">
      {badge}
      {meta && <span className="text-[13px] text-[var(--muted)]">{meta}</span>}
    </div>
  );
}

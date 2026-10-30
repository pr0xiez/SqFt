import { StatusBadge } from "@/components/ui/StatusBadge";
import type { EstimateStatus } from "@/lib/estimateStatus";
import { formatShortDate } from "@/lib/utils";

interface Props {
  status: EstimateStatus;
  sentAt?: Date | string | null;
  approvedAt?: Date | string | null;
  declinedAt?: Date | string | null;
}

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
    meta = `Approved ${formatShortDate(approvedAt)}`;
  } else if (status === "declined" && declinedAt) {
    badge = <StatusBadge status="declined" />;
    meta = `Declined ${formatShortDate(declinedAt)}`;
  } else if (sentAt) {
    meta = `Sent ${formatShortDate(sentAt)}`;
  }

  return (
    <div className="flex items-center gap-x-3 gap-y-1 flex-wrap">
      {badge}
      {meta && <span className="text-[13px] text-[var(--muted)]">{meta}</span>}
    </div>
  );
}

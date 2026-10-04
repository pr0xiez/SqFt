import { CheckCircleIcon, XCircleIcon } from "@/components/ui/icons";

interface Props {
  status: "approved" | "declined";
  approvedAt?: Date | string | null;
  declinedAt?: Date | string | null;
  declineReason?: string | null;
  declineSource?: string | null; // "customer" | "system_supersede" | null
  supersededByEstimateNumber?: number | null;
}

export function EstimateLockBanner({
  status,
  approvedAt,
  declinedAt,
  declineReason,
  declineSource,
  supersededByEstimateNumber,
}: Props) {
  if (status === "approved") {
    const date = approvedAt
      ? new Date(approvedAt).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : "";
    return (
      <div className="mb-6 flex items-start gap-3 px-4 py-3.5 rounded-[var(--r)] bg-[color-mix(in_oklab,var(--ok)_10%,transparent)] border border-[color-mix(in_oklab,var(--ok)_35%,transparent)]">
        <CheckCircleIcon
          aria-hidden="true"
          weight="fill"
          className="size-[22px] shrink-0 text-[var(--ok)]"
        />
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-[600] text-[var(--ok)]">
            Approved{date ? ` on ${date}` : ""}
          </div>
          <div className="mt-0.5 text-[13.5px] text-[var(--ink-2)]">
            This estimate is locked. Use Revise to make changes.
          </div>
        </div>
      </div>
    );
  }

  const date = declinedAt
    ? new Date(declinedAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "";
  const isSuperseded = declineSource === "system_supersede";
  const heading = isSuperseded
    ? `Auto-declined${
        supersededByEstimateNumber
          ? ` when Estimate #${supersededByEstimateNumber} was approved`
          : ""
      }`
    : `Declined by customer${date ? ` on ${date}` : ""}`;

  return (
    <div className="mb-6 px-4 py-3.5 rounded-[var(--r)] bg-[var(--accent-wash)] border border-[color-mix(in_oklab,var(--accent-ink)_35%,transparent)]">
      <div className="flex items-start gap-3">
        <XCircleIcon
          aria-hidden="true"
          weight="fill"
          className="size-[22px] shrink-0 text-[var(--accent-ink)]"
        />
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-[600] text-[var(--accent-ink)]">
            {heading}
          </div>
          <div className="mt-0.5 text-[13.5px] text-[var(--ink-2)]">
            This estimate is locked. Use Revise to send a new version.
          </div>
        </div>
      </div>
      {!isSuperseded && declineReason ? (
        <div className="mt-2.5 pl-[34px] text-[15px] italic text-[var(--ink)]">
          "{declineReason}"
        </div>
      ) : null}
    </div>
  );
}

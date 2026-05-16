interface Props {
  status: "accepted" | "declined";
  acceptedByName?: string | null;
  acceptedAt?: Date | string | null;
  declinedAt?: Date | string | null;
  declineReason?: string | null;
  declineSource?: string | null; // "customer" | "system_supersede" | null
  supersededByQuoteNumber?: number | null;
  signedHref?: string;
}

export function QuoteLockBanner({
  status,
  acceptedByName,
  acceptedAt,
  declinedAt,
  declineReason,
  declineSource,
  supersededByQuoteNumber,
  signedHref,
}: Props) {
  if (status === "accepted") {
    const date = acceptedAt
      ? new Date(acceptedAt).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : "";
    return (
      <div className="mb-6 flex items-center gap-3 p-4 rounded-md bg-[rgba(61,107,74,0.10)] border border-[var(--sage)]">
        <div className="w-8 h-8 rounded-full bg-[var(--sage)] text-white flex items-center justify-center font-[700]">
          ✓
        </div>
        <div className="flex-1">
          <div className="text-[14px] font-[600] text-[var(--sage)]">
            Accepted{acceptedByName ? ` by ${acceptedByName}` : ""}
            {date ? ` on ${date}` : ""}
          </div>
          <div className="text-[12px] text-[var(--ink-2)]">
            This quote is locked. Use Revise to make changes.
          </div>
        </div>
        {signedHref && (
          <a
            href={signedHref}
            className="text-[12px] font-[var(--font-mono)] text-[var(--accent)] underline"
          >
            View signed quote →
          </a>
        )}
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
        supersededByQuoteNumber
          ? ` when Quote #${supersededByQuoteNumber} was accepted`
          : ""
      }`
    : `Declined by customer${date ? ` on ${date}` : ""}`;

  return (
    <div className="mb-6 p-4 rounded-md bg-[rgba(192,52,26,0.06)] border border-[var(--accent)]">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-[var(--accent)] text-white flex items-center justify-center font-[700]">
          ✗
        </div>
        <div className="flex-1">
          <div className="text-[14px] font-[600] text-[var(--accent)]">
            {heading}
          </div>
          <div className="text-[12px] text-[var(--ink-2)]">
            This quote is locked. Use Revise to send a new version.
          </div>
        </div>
      </div>
      {!isSuperseded && declineReason ? (
        <div className="mt-3 pl-11 text-[16px] italic text-[var(--ink)]">
          "{declineReason}"
        </div>
      ) : null}
    </div>
  );
}

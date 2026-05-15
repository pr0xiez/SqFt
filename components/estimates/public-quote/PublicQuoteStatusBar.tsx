interface Props {
  status: "draft" | "sent" | "viewed" | "accepted" | "declined";
  sentAt?: Date | string | null;
  acceptedAt?: Date | string | null;
  declinedAt?: Date | string | null;
}

const fmtDate = (d: Date | string) =>
  new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

export function PublicQuoteStatusBar({
  status,
  sentAt,
  acceptedAt,
  declinedAt,
}: Props) {
  let pillClass = "text-[var(--gold)]";
  let label = "Awaiting your response";
  let meta: string | null = null;

  if (status === "accepted" && acceptedAt) {
    pillClass = "text-[var(--sage)] bg-[rgba(61,107,74,0.08)]";
    label = "Accepted";
    meta = `Signed ${fmtDate(acceptedAt)}`;
  } else if (status === "declined" && declinedAt) {
    pillClass = "text-[var(--muted)]";
    label = "Declined";
    meta = `Declined ${fmtDate(declinedAt)}`;
  } else if (sentAt) {
    meta = `Sent ${fmtDate(sentAt)}`;
  }

  return (
    <div className="max-w-[880px] mx-auto mb-[14px] px-7 flex items-center gap-3 flex-wrap">
      <span
        className={`font-[var(--font-mono)] text-[10px] uppercase tracking-[.06em] px-2.5 py-[5px] rounded-full border border-current font-[600] inline-flex items-center gap-1.5 ${pillClass}`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-current" />
        {label}
      </span>
      {meta && (
        <span className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] tracking-[.02em]">
          {meta}
        </span>
      )}
    </div>
  );
}

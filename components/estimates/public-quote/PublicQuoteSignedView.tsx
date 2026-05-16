interface Props {
  signedByName: string;
  signedAt: Date | string;
  signatureData: string;
}

export function PublicQuoteSignedView({
  signedByName,
  signedAt,
  signatureData,
}: Props) {
  const date = new Date(signedAt);
  return (
    <div className="mt-9 bg-[var(--surface)] border-[1.5px] border-[var(--sage)] rounded-lg p-8">
      <div className="flex items-center gap-3.5 p-4 bg-[rgba(61,107,74,0.08)] rounded-md mb-5">
        <div className="w-9 h-9 rounded-full bg-[var(--sage)] text-white flex items-center justify-center font-[700]">
          ✓
        </div>
        <div className="flex-1">
          <div className="text-[14px] font-[600] text-[var(--sage)]">
            Quote accepted &amp; signed
          </div>
          <div className="font-[var(--font-mono)] text-[11px] text-[var(--ink-2)] mt-0.5">
            {signedByName} ·{" "}
            {date.toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </div>
        </div>
      </div>
      <div className="text-[13px] text-[var(--ink-2)] leading-relaxed mb-4">
        A confirmation has been sent to your email. We'll be in touch within 1
        business day to schedule your install and arrange the deposit invoice.
      </div>
      <div className="p-3.5 bg-[var(--surface-2)] border border-[var(--line)] rounded-md flex items-center gap-6 flex-wrap">
        <div>
          <div className="font-[var(--font-mono)] text-[9px] text-[var(--muted)] uppercase tracking-[.08em] mb-1">
            Signed by
          </div>
          <div className="font-[var(--font-hand,cursive)] text-[28px] text-[var(--ink)] font-[600]">
            {signedByName}
          </div>
        </div>
        <div>
          <div className="font-[var(--font-mono)] text-[9px] text-[var(--muted)] uppercase tracking-[.08em] mb-1">
            Date
          </div>
          <div className="text-[14px]">
            {date.toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </div>
        </div>
        <div className="ml-auto bg-white rounded-sm p-1.5">
          {/* biome-ignore lint/performance/noImgElement: data URL */}
          <img
            src={signatureData}
            alt="signature"
            className="max-h-[60px] max-w-[200px] block"
          />
        </div>
      </div>
    </div>
  );
}

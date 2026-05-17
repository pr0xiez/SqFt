import { notFound } from "next/navigation";
import { getQuote, getQuoteSignature } from "@/lib/repositories";
import { getOrgId } from "@/lib/tenant";

interface Props {
  params: Promise<{ id: string }>;
}

export const metadata = { title: "Signed quote — SqFt" };

export default async function SignedQuotePage({ params }: Props) {
  const orgId = await getOrgId();
  const { id } = await params;
  const quoteId = parseInt(id, 10);
  if (Number.isNaN(quoteId)) notFound();

  const [quote, signature] = await Promise.all([
    getQuote(quoteId, orgId),
    getQuoteSignature(quoteId),
  ]);
  if (!quote || quote.status !== "accepted" || !signature) notFound();

  const snap = signature.quoteSnapshot as Record<string, unknown> & {
    totals?: { total?: number; deposit?: number };
    customer?: { name?: string };
  };

  return (
    <div className="max-w-[800px] mx-auto px-6 py-10">
      <h1 className="text-[28px] font-[700] tracking-[-0.025em] mb-2">
        Signed Quote #{quote.quoteNumber}
      </h1>
      <p className="text-[13px] text-[var(--muted)] mb-6">
        This is the legal record — a snapshot of the quote at the moment the
        customer signed.
      </p>

      <section className="bg-[var(--surface)] border border-[var(--line)] rounded-lg p-6 mb-4">
        <h2 className="font-[var(--font-mono)] text-[10px] uppercase tracking-[.08em] text-[var(--muted)] mb-2">
          Signature
        </h2>
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <div className="text-[12px] text-[var(--muted)]">Signed by</div>
            <div className="text-[16px] font-[600]">
              {signature.signedByName}
            </div>
            <div className="text-[12px] text-[var(--muted)]">
              {signature.signedByEmail}
            </div>
          </div>
          <div>
            <div className="text-[12px] text-[var(--muted)]">Date</div>
            <div className="text-[14px]">
              {new Date(signature.signedAt).toLocaleString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </div>
          </div>
          <div className="ml-auto bg-white border border-[var(--line)] rounded-md p-2">
            {/* biome-ignore lint/performance/noImgElement: data URL */}
            <img
              src={signature.signatureData}
              alt="signature"
              className="h-[90px] w-auto max-w-[320px] block"
            />
          </div>
        </div>
      </section>

      <section className="bg-[var(--surface)] border border-[var(--line)] rounded-lg p-6 mb-4">
        <h2 className="font-[var(--font-mono)] text-[10px] uppercase tracking-[.08em] text-[var(--muted)] mb-2">
          Audit details
        </h2>
        <dl className="grid grid-cols-[140px_1fr] gap-y-1.5 text-[13px]">
          <dt className="text-[var(--muted)]">IP address</dt>
          <dd className="font-[var(--font-mono)]">{signature.signedIp}</dd>
          <dt className="text-[var(--muted)]">User agent</dt>
          <dd className="font-[var(--font-mono)] break-all">
            {signature.signedUserAgent}
          </dd>
          <dt className="text-[var(--muted)]">Snapshot hash</dt>
          <dd className="font-[var(--font-mono)] break-all">
            {signature.snapshotHash}
          </dd>
          <dt className="text-[var(--muted)]">Consent text</dt>
          <dd className="text-[12px] italic">{signature.consentText}</dd>
        </dl>
      </section>

      <section className="bg-[var(--surface)] border border-[var(--line)] rounded-lg p-6">
        <h2 className="font-[var(--font-mono)] text-[10px] uppercase tracking-[.08em] text-[var(--muted)] mb-2">
          Document at signing
        </h2>
        <div className="text-[14px] mb-1">
          Customer: {snap.customer?.name ?? "—"}
        </div>
        <div className="text-[14px] mb-3">
          Total: ${snap.totals?.total?.toFixed(2) ?? "—"} · Deposit: $
          {snap.totals?.deposit?.toFixed(2) ?? "—"}
        </div>
        <details>
          <summary className="cursor-pointer text-[12px] text-[var(--muted)]">
            Show full snapshot JSON
          </summary>
          <pre className="text-[11px] bg-[var(--paper)] p-3 rounded mt-2 overflow-x-auto">
            {JSON.stringify(snap, null, 2)}
          </pre>
        </details>
      </section>
    </div>
  );
}

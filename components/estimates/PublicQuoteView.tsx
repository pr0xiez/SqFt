import {
  fmtDollar,
  getEffectiveQty,
  type LineItemCalc,
  liSubtotal,
  type RoomItem,
  roomSqft,
} from "@/lib/utils";

export interface PublicEstimate {
  id: number;
  title: string;
  quoteNumber: number | null;
  date: string | Date;
  taxRate: number;
  markupPct: number;
  depositPct: number;
  customer: { name: string; address: string | null } | null;
  items: RoomItem[];
  lineItems: LineItemCalc[];
  org: {
    name: string;
    phone: string | null;
    address: string | null;
    licenseNumber: string | null;
    logo: string | null;
  };
}

interface Props {
  estimate: PublicEstimate;
}

export function PublicQuoteView({ estimate }: Props) {
  const rooms = estimate.items.filter((i) => i.type === "room");
  const lineItems = estimate.lineItems;

  const subtotal = lineItems.reduce(
    (sum, li) => sum + (liSubtotal(li, rooms) ?? 0),
    0
  );
  const markup = subtotal * (estimate.markupPct / 100);
  const beforeTax = subtotal + markup;
  const tax = beforeTax * estimate.taxRate;
  const total = beforeTax + tax;
  const deposit = total * estimate.depositPct;

  const docNumber = estimate.quoteNumber
    ? `Q-${estimate.quoteNumber}`
    : `#${estimate.id}`;
  const dateStr = new Date(estimate.date).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="max-w-[760px] mx-auto px-4 py-6 sm:px-8 sm:py-12">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-5 mb-7">
        <div className="min-w-0">
          {estimate.org.logo ? (
            // biome-ignore lint/performance/noImgElement: org logos can be remote URLs not configured in next.config
            <img
              src={estimate.org.logo}
              alt={estimate.org.name}
              className="h-10 max-w-[180px] object-contain mb-2"
            />
          ) : null}
          <div className="text-[18px] font-[700] tracking-[-0.01em]">
            {estimate.org.name}
          </div>
          {estimate.org.address ? (
            <div className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] mt-0.5">
              {estimate.org.address}
            </div>
          ) : null}
          {estimate.org.phone ? (
            <div className="font-[var(--font-mono)] text-[11px] text-[var(--muted)]">
              {estimate.org.phone}
            </div>
          ) : null}
          {estimate.org.licenseNumber ? (
            <div className="font-[var(--font-mono)] text-[11px] text-[var(--muted)]">
              Lic# {estimate.org.licenseNumber}
            </div>
          ) : null}
        </div>
        <div className="sm:text-right">
          <div className="font-[var(--font-display)] text-[22px] font-[800] tracking-[0.08em] text-[var(--ink)]">
            QUOTE
          </div>
          <div className="font-[var(--font-mono)] text-[12px] font-[600] text-[var(--ink-2)]">
            {docNumber}
          </div>
          <div className="font-[var(--font-mono)] text-[11px] text-[var(--muted)]">
            {dateStr}
          </div>
        </div>
      </header>

      <div className="border-t border-[var(--line)] mb-6" />

      {/* Customer */}
      <section className="mb-6">
        <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.06em] mb-1">
          For
        </div>
        <div className="text-[15px] font-[600]">
          {estimate.customer?.name ?? ""}
        </div>
        {estimate.customer?.address ? (
          <div className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] mt-0.5">
            {estimate.customer.address}
          </div>
        ) : null}
      </section>

      {/* Title */}
      {estimate.title ? (
        <h1 className="text-[24px] sm:text-[28px] font-[700] tracking-[-0.025em] mb-5">
          {estimate.title}
        </h1>
      ) : null}

      {/* Rooms */}
      {rooms.length > 0 ? (
        <section className="bg-[var(--surface)] border border-[var(--line)] rounded-lg overflow-hidden mb-4">
          <div className="px-3.5 py-2.5 bg-[var(--surface-2)] border-b border-[var(--line)]">
            <span className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.06em]">
              Rooms
            </span>
          </div>
          <ul className="divide-y divide-[var(--line)]">
            {rooms.map((r) => (
              <li
                key={r.id}
                className="flex justify-between items-baseline px-4 py-3"
              >
                <span className="text-[14px] font-[500] truncate pr-3">
                  {r.name || "Room"}
                </span>
                <span className="font-[var(--font-mono)] text-[12px] text-[var(--muted)] shrink-0">
                  {Math.round(roomSqft(r))} ft²
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Line items */}
      {lineItems.length > 0 ? (
        <section className="bg-[var(--surface)] border border-[var(--line)] rounded-lg overflow-hidden mb-4">
          <div className="px-3.5 py-2.5 bg-[var(--surface-2)] border-b border-[var(--line)]">
            <span className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.06em]">
              Line items
            </span>
          </div>
          <ul className="divide-y divide-[var(--line)]">
            {lineItems.map((li) => {
              const qty = getEffectiveQty(li, rooms);
              const sub = liSubtotal(li, rooms);
              return (
                <li key={li.id} className="px-4 py-3">
                  <div className="flex justify-between gap-3 items-baseline">
                    <span className="text-[14px] font-[500] truncate">
                      {li.name}
                    </span>
                    <span className="font-[var(--font-mono)] text-[13px] font-[600] shrink-0">
                      {sub != null ? fmtDollar(sub) : "—"}
                    </span>
                  </div>
                  <div className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] mt-0.5">
                    {qty != null ? qty.toFixed(2) : "—"} {li.unitLabel} ×{" "}
                    {fmtDollar(li.rate)}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* Totals */}
      <section className="bg-[var(--surface)] border border-[var(--line)] rounded-lg p-5 space-y-2.5">
        <Row label="Subtotal" value={fmtDollar(subtotal)} />
        {estimate.markupPct > 0 ? (
          <Row
            label={`Markup (${estimate.markupPct}%)`}
            value={fmtDollar(markup)}
          />
        ) : null}
        <Row
          label={`Tax (${(estimate.taxRate * 100).toFixed(1)}%)`}
          value={fmtDollar(tax)}
        />
        <div className="flex justify-between items-baseline pt-3 border-t border-[var(--line)]">
          <span className="text-[15px] font-[600] tracking-[-0.01em]">
            Total
          </span>
          <span className="text-[24px] sm:text-[28px] font-[700] tracking-[-0.025em] leading-none">
            {fmtDollar(total)}
          </span>
        </div>
        {estimate.depositPct > 0 ? (
          <div className="flex justify-between items-baseline">
            <span className="font-[var(--font-mono)] text-[11px] text-[var(--muted)]">
              Deposit ({(estimate.depositPct * 100).toFixed(0)}% due)
            </span>
            <span className="font-[var(--font-mono)] text-[13px] font-[600] text-[var(--sage)]">
              {fmtDollar(deposit)}
            </span>
          </div>
        ) : null}
      </section>

      <footer className="text-center mt-10 font-[var(--font-mono)] text-[10px] text-[var(--muted)]">
        Quote prepared by {estimate.org.name}
      </footer>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-baseline">
      <span className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] tracking-[.04em]">
        {label}
      </span>
      <span className="font-[var(--font-mono)] text-[13px] font-[600]">
        {value}
      </span>
    </div>
  );
}

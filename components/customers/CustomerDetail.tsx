"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { Button } from "@/components/ui/Button";
import { SourceBadge } from "@/components/ui/SourceBadge";
import { useToast } from "@/components/ui/Toast";
import {
  estimateStatusTone,
  isOpenEstimate,
  lastTouchAt,
  relativeTime,
} from "@/lib/estimateStatus";
import {
  type CustomerEstimateSummary,
  type CustomerSiteMeasureSummary,
  useCustomer,
  useUpdateCustomer,
} from "@/lib/hooks/useCustomers";
import { useCreateSiteMeasure } from "@/lib/hooks/useSiteMeasures";
import { sourceName } from "@/lib/utils";

interface Props {
  customerId: number;
}

function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function StatusPill({ status }: { status: string }) {
  const tone = estimateStatusTone(status);
  return (
    <span
      className="inline-flex items-center gap-1.5 font-[var(--font-mono)] text-[9.5px] uppercase tracking-[.08em] px-2 py-[3px] rounded-[4px] border"
      style={{
        color: tone.fg,
        borderColor: tone.border,
        background: tone.bg,
      }}
    >
      <span className="w-1 h-1 rounded-full" style={{ background: tone.fg }} />
      {tone.label}
    </span>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "ink" | "sage" | "gold" | "accent" | "muted";
}) {
  const colorMap: Record<string, string> = {
    ink: "var(--ink)",
    sage: "var(--sage)",
    gold: "var(--gold)",
    accent: "var(--accent)",
    muted: "var(--muted)",
  };
  return (
    <div className="flex-1 min-w-[120px] px-4 py-3.5">
      <div className="font-[var(--font-mono)] text-[9.5px] uppercase tracking-[.09em] text-[var(--muted)] mb-1.5">
        {label}
      </div>
      <div
        className="text-[26px] font-[700] leading-none tracking-[-0.03em] tabular-nums"
        style={{ color: colorMap[tone ?? "ink"] }}
      >
        {value}
      </div>
      {hint && (
        <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] mt-1.5 tracking-[.02em]">
          {hint}
        </div>
      )}
    </div>
  );
}

export function CustomerDetailView({ customerId }: Props) {
  const router = useRouter();
  const { data: customer, isLoading } = useCustomer(customerId);
  const updateCustomer = useUpdateCustomer(customerId);
  const createSiteMeasure = useCreateSiteMeasure();
  const { showToast } = useToast();

  const siteMeasures: CustomerSiteMeasureSummary[] = useMemo(
    () => customer?.siteMeasures ?? [],
    [customer?.siteMeasures]
  );

  const stats = useMemo(() => {
    const allEstimates: CustomerEstimateSummary[] = siteMeasures.flatMap(
      (e) => e.estimates ?? []
    );
    const open = allEstimates.filter(isOpenEstimate).length;
    const accepted = allEstimates.filter((q) => q.status === "accepted").length;
    const declined = allEstimates.filter((q) => q.status === "declined").length;
    const lastActivityIso = allEstimates.map(lastTouchAt).sort().reverse()[0];
    return {
      siteMeasureCount: siteMeasures.length,
      estimateCount: allEstimates.length,
      open,
      accepted,
      declined,
      lastActivity: lastActivityIso ?? customer?.createdAt ?? null,
    };
  }, [siteMeasures, customer?.createdAt]);

  async function handleField(field: string, value: string) {
    try {
      await updateCustomer.mutateAsync({ [field]: value });
    } catch {
      showToast("Failed to save");
    }
  }

  async function handleNewSiteMeasure() {
    try {
      const est = await createSiteMeasure.mutateAsync({ customerId });
      router.push(`/site-measures/${est.id}`);
    } catch {
      showToast("Failed to create site measure");
    }
  }

  if (isLoading) {
    return (
      <p className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] py-8">
        Loading…
      </p>
    );
  }

  if (!customer) {
    return (
      <p className="font-[var(--font-mono)] text-[11px] text-[var(--accent)] py-8">
        Customer not found.
      </p>
    );
  }

  return (
    <>
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between mb-6 gap-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-[var(--font-mono)] text-[10.5px] text-[var(--muted)] uppercase tracking-[.1em] mb-2">
            <span>{sourceName(customer.source)}</span>
            <span className="w-px h-3 bg-[var(--line-2)]" />
            <span>Added {formatShortDate(customer.createdAt)}</span>
          </div>
          <h1 className="text-[40px] font-[700] leading-[1.02] tracking-[-0.03em]">
            {customer.name}
          </h1>
          {customer.address && (
            <div className="font-[var(--font-mono)] text-[11.5px] text-[var(--muted)] mt-2 tracking-[.02em]">
              {customer.address}
            </div>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <Button onClick={() => router.push("/customers")}>← Customers</Button>
          <Button
            variant="primary"
            onClick={handleNewSiteMeasure}
            disabled={createSiteMeasure.isPending}
          >
            + New Site Measure
          </Button>
        </div>
      </div>

      {/* Stat strip */}
      <div className="bg-[var(--surface)] border border-[var(--line)] rounded-lg mb-4 flex flex-wrap divide-x divide-[var(--line)] overflow-hidden">
        <Stat
          label="Site Measures"
          value={stats.siteMeasureCount}
          hint={`${stats.estimateCount} estimate${stats.estimateCount === 1 ? "" : "s"} total`}
        />
        <Stat
          label="Open"
          value={stats.open}
          tone={stats.open > 0 ? "gold" : "muted"}
          hint={stats.open > 0 ? "Awaiting reply" : "Nothing pending"}
        />
        <Stat
          label="Accepted"
          value={stats.accepted}
          tone={stats.accepted > 0 ? "sage" : "muted"}
          hint={stats.declined > 0 ? `${stats.declined} declined` : undefined}
        />
        <Stat
          label="Last activity"
          value={stats.lastActivity ? relativeTime(stats.lastActivity) : "—"}
          hint={
            stats.lastActivity ? formatShortDate(stats.lastActivity) : undefined
          }
        />
      </div>

      {/* Customer card */}
      <div className="bg-[var(--surface)] border border-[var(--line)] rounded-lg p-6 mb-4">
        <div className="flex items-center gap-3 mb-5">
          <input
            type="text"
            defaultValue={customer.name}
            onBlur={(e) => handleField("name", e.target.value)}
            className="text-[22px] font-[700] tracking-[-0.025em] border-none bg-transparent flex-1 min-w-0 p-0 focus:outline-none"
          />
          <SourceBadge source={customer.source} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
          <div>
            <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.06em] mb-[5px]">
              Phone
            </div>
            <input
              type="tel"
              defaultValue={customer.phone ?? ""}
              onBlur={(e) => handleField("phone", e.target.value)}
              className="w-full text-[13px] border-none border-b border-[var(--line)] bg-transparent py-[5px] focus:outline-none focus:border-[var(--ink-2)] transition-[border-color] duration-150"
            />
          </div>
          <div>
            <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.06em] mb-[5px]">
              Email
            </div>
            <input
              type="email"
              defaultValue={customer.email ?? ""}
              onBlur={(e) => handleField("email", e.target.value)}
              className="w-full text-[13px] border-none border-b border-[var(--line)] bg-transparent py-[5px] focus:outline-none focus:border-[var(--ink-2)] transition-[border-color] duration-150"
            />
          </div>
          <div className="md:col-span-2">
            <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.06em] mb-[5px]">
              Address
            </div>
            <input
              type="text"
              defaultValue={customer.address ?? ""}
              onBlur={(e) => handleField("address", e.target.value)}
              className="w-full text-[13px] border-none border-b border-[var(--line)] bg-transparent py-[5px] focus:outline-none focus:border-[var(--ink-2)] transition-[border-color] duration-150"
            />
          </div>
          <div>
            <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.06em] mb-[5px]">
              Source
            </div>
            <select
              defaultValue={customer.source}
              onChange={(e) => handleField("source", e.target.value)}
              className="w-full text-[13px] border-none border-b border-[var(--line)] bg-transparent py-[5px] focus:outline-none focus:border-[var(--ink-2)] transition-[border-color] duration-150"
            >
              <option value="phone">Phone call</option>
              <option value="online">Online lead</option>
              <option value="referral">Referral</option>
              <option value="walkin">Walk-in</option>
              <option value="website">Website</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.06em] mb-[5px]">
              Notes
            </div>
            <textarea
              rows={2}
              defaultValue={customer.notes ?? ""}
              onBlur={(e) => handleField("notes", e.target.value)}
              className="w-full text-[13px] border-none border-b border-[var(--line)] bg-transparent py-[5px] focus:outline-none focus:border-[var(--ink-2)] transition-[border-color] duration-150 resize-y"
            />
          </div>
        </div>
      </div>

      {/* Pipeline */}
      <div className="bg-[var(--surface)] border border-[var(--line)] rounded-lg p-5">
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <h2 className="text-[15px] font-[700] tracking-[-0.015em]">
              Pipeline
            </h2>
            <div className="font-[var(--font-mono)] text-[10.5px] text-[var(--muted)] uppercase tracking-[.08em] mt-0.5">
              SiteMeasures & estimates
            </div>
          </div>
          {stats.open > 0 && (
            <div className="font-[var(--font-mono)] text-[10.5px] text-[var(--gold)] uppercase tracking-[.08em]">
              {stats.open} awaiting
            </div>
          )}
        </div>

        {siteMeasures.length === 0 ? (
          <div className="py-10 text-center">
            <div className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] mb-3">
              No siteMeasures yet.
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={handleNewSiteMeasure}
              disabled={createSiteMeasure.isPending}
            >
              + Start first site measure
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {siteMeasures.map((est) => (
              <SiteMeasureRow
                key={est.id}
                siteMeasure={est}
                onOpenSiteMeasure={() =>
                  router.push(`/site-measures/${est.id}`)
                }
                onOpenEstimate={(qid) => router.push(`/estimates/${qid}`)}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function SiteMeasureRow({
  siteMeasure,
  onOpenSiteMeasure,
  onOpenEstimate,
}: {
  siteMeasure: CustomerSiteMeasureSummary;
  onOpenSiteMeasure: () => void;
  onOpenEstimate: (id: number) => void;
}) {
  const estimates = siteMeasure.estimates ?? [];
  const openCount = estimates.filter(isOpenEstimate).length;
  const acceptedCount = estimates.filter((q) => q.status === "accepted").length;

  return (
    <div className="border border-[var(--line)] rounded-md overflow-hidden">
      {/* SiteMeasure header */}
      <button
        type="button"
        onClick={onOpenSiteMeasure}
        className="w-full text-left flex items-center gap-3 px-4 py-3 bg-[var(--surface-2)] hover:bg-[color-mix(in_srgb,var(--surface-2)_70%,var(--line))] transition-colors duration-150 cursor-pointer"
      >
        <span className="font-[var(--font-mono)] text-[10.5px] uppercase tracking-[.09em] text-[var(--muted)] shrink-0">
          Site Measure{" "}
          <span className="text-[var(--ink)]">
            #{siteMeasure.siteMeasureNumber ?? siteMeasure.id}
          </span>
        </span>
        <span className="font-[var(--font-mono)] text-[10px] text-[var(--muted)]">
          {formatShortDate(siteMeasure.date)}
        </span>
        <div className="flex-1 min-w-0">
          {siteMeasure.title && (
            <span className="text-[12.5px] font-[600] tracking-[-0.005em] truncate block">
              {siteMeasure.title}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {acceptedCount > 0 && (
            <span className="font-[var(--font-mono)] text-[10px] text-[var(--sage)] uppercase tracking-[.08em]">
              ✓ Accepted
            </span>
          )}
          {openCount > 0 && (
            <span className="font-[var(--font-mono)] text-[10px] text-[var(--gold)] uppercase tracking-[.08em]">
              {openCount} open
            </span>
          )}
          <span className="font-[var(--font-mono)] text-[10px] text-[var(--muted)]">
            Open →
          </span>
        </div>
      </button>

      {/* Estimate thread */}
      {estimates.length === 0 ? (
        <div className="px-4 py-3 font-[var(--font-mono)] text-[10.5px] text-[var(--muted)] italic">
          No estimates drafted on this siteMeasure yet.
        </div>
      ) : (
        <ul className="divide-y divide-[var(--line)]">
          {estimates.map((q) => {
            const tone = estimateStatusTone(q.status);
            const touch = lastTouchAt(q);
            return (
              <li key={q.id}>
                <button
                  type="button"
                  onClick={() => onOpenEstimate(q.id)}
                  className="w-full text-left flex items-center gap-3 pl-4 pr-4 py-3 hover:bg-[var(--surface-2)] cursor-pointer transition-[background,padding] duration-[120ms] hover:pl-5 group"
                  style={{
                    borderLeft: `3px solid ${tone.fg}`,
                  }}
                >
                  <span className="font-[var(--font-mono)] text-[11px] font-[600] tabular-nums text-[var(--ink)] min-w-[44px]">
                    E#{q.estimateNumber}
                  </span>
                  <StatusPill status={q.status} />
                  <div className="flex-1 min-w-0 flex items-baseline gap-2">
                    <span className="font-[var(--font-mono)] text-[10.5px] text-[var(--muted)] tracking-[.02em]">
                      {q.status === "accepted"
                        ? "Accepted"
                        : q.status === "declined"
                          ? "Declined"
                          : q.status === "viewed"
                            ? "Viewed"
                            : q.status === "sent"
                              ? "Sent"
                              : "Created"}{" "}
                      {relativeTime(touch)}
                    </span>
                    <span className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] hidden sm:inline">
                      · {q._count.lineItems} line item
                      {q._count.lineItems === 1 ? "" : "s"}
                    </span>
                  </div>
                  <span className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] group-hover:text-[var(--ink)] transition-colors">
                    Open →
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

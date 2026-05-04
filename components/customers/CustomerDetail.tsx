"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { SourceBadge } from "@/components/ui/SourceBadge";
import { useToast } from "@/components/ui/Toast";
import { useCustomer, useUpdateCustomer } from "@/lib/hooks/useCustomers";
import { useCreateEstimate } from "@/lib/hooks/useEstimates";
import { sourceName } from "@/lib/utils";

interface Props {
  customerId: number;
}

export function CustomerDetailView({ customerId }: Props) {
  const router = useRouter();
  const { data: customer, isLoading } = useCustomer(customerId);
  const updateCustomer = useUpdateCustomer(customerId);
  const createEstimate = useCreateEstimate();
  const { showToast } = useToast();

  async function handleField(field: string, value: string) {
    try {
      await updateCustomer.mutateAsync({ [field]: value });
    } catch {
      showToast("Failed to save");
    }
  }

  async function handleNewEstimate() {
    try {
      const est = await createEstimate.mutateAsync({ customerId });
      router.push(`/estimates/${est.id}`);
    } catch {
      showToast("Failed to create estimate");
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

  const estimates = customer.estimates ?? [];

  return (
    <>
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between mb-7 gap-5">
        <div>
          <div className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] tracking-[.04em] mb-1.5">
            {sourceName(customer.source)} · added{" "}
            {new Date(customer.createdAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </div>
          <h1 className="text-[36px] font-[700] leading-[1.05] tracking-[-0.025em]">
            {customer.name}
          </h1>
          <div className="font-[var(--font-mono)] text-[12px] text-[var(--muted)] mt-2">
            {estimates.length} estimate{estimates.length === 1 ? "" : "s"} ·{" "}
            {customer.address || "no address"}
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => router.push("/customers")}>← Customers</Button>
          <Button
            variant="primary"
            onClick={handleNewEstimate}
            disabled={createEstimate.isPending}
          >
            + New Estimate
          </Button>
        </div>
      </div>

      {/* Customer card */}
      <div className="bg-[var(--surface)] border border-[var(--line)] rounded-lg p-6 mb-3.5">
        <input
          type="text"
          defaultValue={customer.name}
          onBlur={(e) => handleField("name", e.target.value)}
          className="text-[28px] font-[700] tracking-[-0.025em] border-none bg-transparent w-full p-0 mb-2 focus:outline-none"
        />
        <div className="mb-4">
          <SourceBadge source={customer.source} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
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
          <div className="md:col-span-3">
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
          <div className="md:col-span-3">
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

      {/* Estimates card */}
      <div className="bg-[var(--surface)] border border-[var(--line)] rounded-lg p-5">
        <div className="flex items-baseline justify-between mb-3.5">
          <strong className="text-[14px] font-[600] tracking-[-0.01em]">
            Estimates{" "}
            <span className="text-[var(--muted)] font-[400]">
              ({estimates.length})
            </span>
          </strong>
        </div>
        {estimates.length === 0 ? (
          <div className="font-[var(--font-mono)] text-[12px] text-[var(--muted)] py-3">
            No estimates yet.
          </div>
        ) : (
          estimates.map((est, idx) => (
            <button
              key={est.id}
              type="button"
              onClick={() => router.push(`/estimates/${est.id}`)}
              className={`w-full text-left flex items-start gap-3.5 py-[11px] cursor-pointer transition-[padding] duration-150 hover:pl-1.5 ${idx < estimates.length - 1 ? "border-b border-[var(--line)]" : ""}`}
            >
              <span className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] min-w-[50px] shrink-0 pt-px">
                #{est.id}
              </span>
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0 mt-[6px]"
                style={{ background: "var(--accent)" }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-[600] tracking-[-0.01em]">
                  {est.date
                    ? new Date(est.date).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                    : "—"}
                </div>
                <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] mt-0.5">
                  {est.status}
                </div>
              </div>
              <span className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] shrink-0">
                Open →
              </span>
            </button>
          ))
        )}
      </div>
    </>
  );
}

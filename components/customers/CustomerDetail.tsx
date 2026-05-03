"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { SourceBadge } from "@/components/ui/SourceBadge";
import { useToast } from "@/components/ui/Toast";
import { useCustomer, useUpdateCustomer } from "@/lib/hooks/useCustomers";
import { useCreateEstimate } from "@/lib/hooks/useEstimates";

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
      showToast("Failed to save. Please try again.");
    }
  }

  async function handleNewEstimate() {
    try {
      const est = await createEstimate.mutateAsync({ customerId });
      router.push(`/estimates/${est.id}`);
    } catch {
      showToast("Failed to create estimate.");
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
    <div className="space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 font-[var(--font-mono)] text-[11px] text-[var(--muted)]">
        <button
          type="button"
          onClick={() => router.push("/customers")}
          className="hover:text-[var(--ink)] transition-colors"
        >
          Customers
        </button>
        <span>/</span>
        <span className="text-[var(--ink)]">{customer.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-end justify-between pb-4 border-b border-[var(--line)]">
        <div>
          <div className="mb-2">
            <SourceBadge source={customer.source} />
          </div>
          <h1 className="font-[var(--font-display)] text-[32px] font-[700] text-[var(--ink)] leading-[1.05] tracking-[-0.025em]">
            {customer.name}
          </h1>
        </div>
        <Button
          variant="primary"
          onClick={handleNewEstimate}
          disabled={createEstimate.isPending}
        >
          + New estimate
        </Button>
      </div>

      {/* Fields */}
      <div className="grid md:grid-cols-2 gap-4">
        {[
          { field: "name", label: "Full name", type: "text" },
          { field: "phone", label: "Phone", type: "tel" },
          { field: "email", label: "Email", type: "email" },
          { field: "address", label: "Address", type: "text" },
        ].map(({ field, label, type }) => (
          <div key={field} className="flex flex-col gap-1">
            <label className="font-[var(--font-mono)] text-[10px] uppercase tracking-[.06em] text-[var(--muted)]">
              {label}
            </label>
            <input
              type={type}
              defaultValue={
                (customer as unknown as Record<string, string>)[field] ?? ""
              }
              onBlur={(e) => handleField(field, e.target.value)}
              className="border border-[var(--line)] bg-[var(--surface)] px-3 py-2 rounded-[6px] font-[var(--font-mono)] text-[13px] text-[var(--ink)] focus:outline-none focus:border-[var(--accent)] transition-[border-color] duration-[150ms]"
            />
          </div>
        ))}
      </div>

      {/* Notes */}
      <div className="flex flex-col gap-1">
        <label className="font-[var(--font-mono)] text-[10px] uppercase tracking-[.06em] text-[var(--muted)]">
          Notes
        </label>
        <textarea
          rows={3}
          defaultValue={customer.notes ?? ""}
          onBlur={(e) => handleField("notes", e.target.value)}
          className="border border-[var(--line)] bg-[var(--surface)] px-3 py-2 rounded-[6px] font-[var(--font-mono)] text-[13px] text-[var(--ink)] focus:outline-none focus:border-[var(--accent)] transition-[border-color] duration-[150ms] resize-none"
        />
      </div>

      {/* Estimates list */}
      <div className="space-y-2">
        <h2 className="font-[var(--font-display)] text-[15px] font-[600] text-[var(--ink)] tracking-[-0.01em]">
          Estimates
        </h2>
        {!customer.estimates || customer.estimates.length === 0 ? (
          <p className="font-[var(--font-mono)] text-[11px] text-[var(--muted)]">
            No estimates yet.
          </p>
        ) : (
          <div className="divide-y divide-[var(--line)] border border-[var(--line)] rounded-lg overflow-hidden">
            {customer.estimates.map((est: { id: number; date: string }) => (
              <button
                key={est.id}
                type="button"
                onClick={() => router.push(`/estimates/${est.id}`)}
                className="w-full text-left flex items-center justify-between px-4 py-3 bg-[var(--surface)] hover:bg-[var(--surface-2)] transition-colors"
              >
                <span className="font-[var(--font-mono)] text-[12px] text-[var(--ink)]">
                  #{est.id}
                </span>
                <span className="font-[var(--font-mono)] text-[12px] text-[var(--muted)]">
                  {new Date(est.date).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

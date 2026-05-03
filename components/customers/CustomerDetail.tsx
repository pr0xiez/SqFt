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
      <p className="font-[var(--font-mono)] text-xs text-driftwood italic py-8">
        Loading…
      </p>
    );
  }

  if (!customer) {
    return (
      <p className="font-[var(--font-mono)] text-xs text-vermil py-8">
        Customer not found.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 font-[var(--font-mono)] text-[11px] text-driftwood">
        <button
          onClick={() => router.push("/customers")}
          className="hover:text-oak transition-colors"
        >
          Customers
        </button>
        <span>/</span>
        <span className="text-oak">{customer.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-end justify-between pb-3 border-b-2 border-oak">
        <div>
          <div className="mb-1">
            <SourceBadge source={customer.source} />
          </div>
          <h1 className="font-[var(--font-display)] text-[32px] font-black text-oak leading-none tracking-tight">
            {customer.name}
          </h1>
        </div>
        <Button
          variant="primary"
          onClick={handleNewEstimate}
          disabled={createEstimate.isPending}
        >
          + New Estimate
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
            <label className="font-[var(--font-mono)] text-[10px] uppercase tracking-widest text-driftwood">
              {label}
            </label>
            <input
              type={type}
              defaultValue={
                (customer as unknown as Record<string, string>)[field] ?? ""
              }
              onBlur={(e) => handleField(field, e.target.value)}
              className="border-[1.5px] border-oak bg-linen px-3 py-2 font-[var(--font-mono)] text-sm text-oak focus:outline-none focus:border-vermil"
            />
          </div>
        ))}
      </div>

      {/* Notes */}
      <div className="flex flex-col gap-1">
        <label className="font-[var(--font-mono)] text-[10px] uppercase tracking-widest text-driftwood">
          Notes
        </label>
        <textarea
          rows={3}
          defaultValue={customer.notes ?? ""}
          onBlur={(e) => handleField("notes", e.target.value)}
          className="border-[1.5px] border-oak bg-linen px-3 py-2 font-[var(--font-mono)] text-sm text-oak focus:outline-none focus:border-vermil resize-none"
        />
      </div>

      {/* Estimates list */}
      <div className="space-y-2">
        <h2 className="font-[var(--font-display)] text-base font-bold text-oak">
          Estimates
        </h2>
        {!customer.estimates || customer.estimates.length === 0 ? (
          <p className="font-[var(--font-mono)] text-xs text-driftwood italic">
            No estimates yet.
          </p>
        ) : (
          <div className="divide-y divide-linen-dd border-[1.5px] border-oak">
            {customer.estimates.map((est: { id: number; date: string }) => (
              <button
                key={est.id}
                onClick={() => router.push(`/estimates/${est.id}`)}
                className="w-full text-left flex items-center justify-between px-4 py-3 bg-cream hover:bg-linen transition-colors"
              >
                <span className="font-[var(--font-mono)] text-xs text-oak">
                  #{est.id}
                </span>
                <span className="font-[var(--font-mono)] text-xs text-driftwood">
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

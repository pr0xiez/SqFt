"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCustomers, useCreateCustomer, type CreateCustomerInput } from "@/lib/hooks/useCustomers";
import { Button } from "@/components/ui/Button";
import { SourceBadge } from "@/components/ui/SourceBadge";
import { SlidePanel } from "@/components/ui/SlidePanel";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";

const SOURCES = ["all", "phone", "online", "referral", "walkin", "website"] as const;

export function CustomerListView() {
  const router = useRouter();
  const { data: customers = [], isLoading } = useCustomers();
  const createCustomer = useCreateCustomer();
  const { showToast } = useToast();

  const [filter, setFilter] = useState<string>("all");
  const [panelOpen, setPanelOpen] = useState(false);

  const [form, setForm] = useState<CreateCustomerInput>({
    name: "", phone: "", email: "", address: "", source: "phone", notes: "",
  });

  const filtered = filter === "all"
    ? customers
    : customers.filter((c) => c.source === filter);

  async function handleSave() {
    if (!form.name.trim()) return;
    try {
      const created = await createCustomer.mutateAsync(form);
      setPanelOpen(false);
      setForm({ name: "", phone: "", email: "", address: "", source: "phone", notes: "" });
      showToast(`Customer "${created.name}" added.`);
    } catch {
      showToast("Failed to create customer. Please try again.");
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-end justify-between pb-3 border-b-2 border-oak">
        <div>
          <p className="font-[var(--font-label)] text-[11px] italic text-vermil mb-1">
            All clients
          </p>
          <h1 className="font-[var(--font-display)] text-[36px] font-black text-oak leading-none tracking-tight">
            Customers
          </h1>
        </div>
        <Button variant="primary" onClick={() => setPanelOpen(true)}>
          + New Customer
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {SOURCES.map((src) => (
          <button
            key={src}
            onClick={() => setFilter(src)}
            className={cn(
              "min-h-[44px] px-[18px] font-[var(--font-mono)] text-[11px] uppercase tracking-wider border",
              "transition-all duration-100 shadow-[2px_2px_0_var(--linen-dd)]",
              filter === src
                ? "bg-oak border-oak text-linen"
                : "bg-linen border-sand text-driftwood hover:border-oak hover:text-oak"
            )}
          >
            {src === "all" ? "All" : src}
          </button>
        ))}
      </div>

      {/* Table header — desktop only */}
      <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_1fr_80px] gap-3 px-4 py-2 font-[var(--font-mono)] text-[10px] uppercase tracking-widest text-driftwood border-b border-linen-dd">
        <span>Name</span>
        <span>Phone</span>
        <span>Source</span>
        <span>Added</span>
        <span className="text-right">Estimates</span>
      </div>

      {/* Rows */}
      {isLoading ? (
        <p className="font-[var(--font-mono)] text-xs text-driftwood italic py-4">
          Loading…
        </p>
      ) : filtered.length === 0 ? (
        <p className="font-[var(--font-mono)] text-xs text-driftwood italic py-4">
          No customers yet. Add your first one →
        </p>
      ) : (
        <div className="divide-y divide-linen-dd">
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => router.push(`/customers/${c.id}`)}
              className="w-full text-left grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr_80px] gap-x-3 gap-y-0 px-4 py-3 bg-cream hover:bg-linen transition-colors cursor-pointer"
            >
              {/* Name + address (always visible) + mobile secondary row */}
              <div>
                <span className="font-[var(--font-display)] text-sm font-bold text-oak">
                  {c.name}
                </span>
                {c.address && (
                  <span className="block font-[var(--font-mono)] text-[11px] text-driftwood truncate">
                    {c.address}
                  </span>
                )}
                {/* Mobile-only: source + estimate count */}
                <div className="flex items-center gap-3 mt-1.5 md:hidden">
                  <SourceBadge source={c.source} />
                  <span className="font-[var(--font-mono)] text-[10px] text-driftwood">
                    {c._count?.estimates ?? 0} estimate{(c._count?.estimates ?? 0) !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>

              {/* Desktop-only columns */}
              <span className="font-[var(--font-mono)] text-xs text-oak hidden md:block self-center">
                {c.phone ?? "—"}
              </span>
              <span className="hidden md:flex items-center">
                <SourceBadge source={c.source} />
              </span>
              <span className="font-[var(--font-mono)] text-xs text-driftwood hidden md:block self-center">
                {new Date(c.createdAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "2-digit",
                })}
              </span>
              <span className="font-[var(--font-mono)] text-xs text-right text-oak hidden md:block self-center">
                {c._count?.estimates ?? 0}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* New Customer Panel */}
      <SlidePanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        title="New Customer"
      >
        <div className="space-y-4">
          {/* Source tabs */}
          <div>
            <label className="font-[var(--font-mono)] text-[10px] uppercase tracking-widest text-driftwood block mb-2">
              Lead source
            </label>
            <div className="flex flex-wrap gap-1.5">
              {(["phone", "online", "referral", "walkin", "website"] as const).map((src) => (
                <button
                  key={src}
                  onClick={() => setForm((f) => ({ ...f, source: src }))}
                  className={cn(
                    "min-h-[44px] px-3 font-[var(--font-mono)] text-[10px] uppercase tracking-wider border text-xs",
                    form.source === src
                      ? "bg-oak border-oak text-linen"
                      : "bg-linen border-sand text-driftwood hover:border-oak"
                  )}
                >
                  {src}
                </button>
              ))}
            </div>
          </div>

          {[
            { field: "name" as const, label: "Full name *", type: "text", required: true },
            { field: "phone" as const, label: "Phone", type: "tel", required: false },
            { field: "email" as const, label: "Email", type: "email", required: false },
            { field: "address" as const, label: "Address", type: "text", required: false },
          ].map(({ field, label, type, required }) => (
            <div key={field} className="flex flex-col gap-1">
              <label className="font-[var(--font-mono)] text-[10px] uppercase tracking-widest text-driftwood">
                {label}
              </label>
              <input
                type={type}
                value={(form[field] as string) ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
                required={required}
                className="border-[1.5px] border-oak bg-linen px-3 py-2 font-[var(--font-mono)] text-sm text-oak focus:outline-none focus:border-vermil"
              />
            </div>
          ))}

          <div className="flex flex-col gap-1">
            <label className="font-[var(--font-mono)] text-[10px] uppercase tracking-widest text-driftwood">
              Notes
            </label>
            <textarea
              rows={3}
              value={form.notes ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="border-[1.5px] border-oak bg-linen px-3 py-2 font-[var(--font-mono)] text-sm text-oak focus:outline-none focus:border-vermil resize-none"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              variant="primary"
              onClick={handleSave}
              disabled={!form.name.trim() || createCustomer.isPending}
              className="flex-1 justify-center"
            >
              {createCustomer.isPending ? "Saving…" : "Save Customer"}
            </Button>
            <Button onClick={() => setPanelOpen(false)} className="flex-1 justify-center">
              Cancel
            </Button>
          </div>
        </div>
      </SlidePanel>
    </div>
  );
}

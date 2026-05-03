"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { SlidePanel } from "@/components/ui/SlidePanel";
import { SourceBadge } from "@/components/ui/SourceBadge";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import {
  type CreateCustomerInput,
  useCreateCustomer,
  useCustomers,
} from "@/lib/hooks/useCustomers";

const SOURCES = [
  "all",
  "phone",
  "online",
  "referral",
  "walkin",
  "website",
] as const;

export function CustomerListView() {
  const router = useRouter();
  const { data: customers = [], isLoading } = useCustomers();
  const createCustomer = useCreateCustomer();
  const { showToast } = useToast();

  const [filter, setFilter] = useState<string>("all");
  const [panelOpen, setPanelOpen] = useState(false);

  const [form, setForm] = useState<CreateCustomerInput>({
    name: "",
    phone: "",
    email: "",
    address: "",
    source: "phone",
    notes: "",
  });

  const filtered =
    filter === "all" ? customers : customers.filter((c) => c.source === filter);

  async function handleSave() {
    if (!form.name.trim()) return;
    try {
      const created = await createCustomer.mutateAsync(form);
      setPanelOpen(false);
      setForm({
        name: "",
        phone: "",
        email: "",
        address: "",
        source: "phone",
        notes: "",
      });
      showToast(`Customer "${created.name}" added.`);
    } catch {
      showToast("Failed to create customer. Please try again.");
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-end justify-between pb-4 border-b border-[var(--line)]">
        <div>
          <div className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] tracking-[.04em] mb-1.5">
            All clients
          </div>
          <h1 className="font-[var(--font-display)] text-[36px] font-[700] text-[var(--ink)] leading-[1.05] tracking-[-0.025em]">
            Customers
          </h1>
        </div>
        <Button variant="primary" onClick={() => setPanelOpen(true)}>
          + New customer
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {SOURCES.map((src) => (
          <button
            key={src}
            type="button"
            onClick={() => setFilter(src)}
            className={cn(
              "min-h-[36px] px-4 font-[var(--font-mono)] text-[11px] tracking-[.02em]",
              "border rounded-[6px] transition-[background,border-color,color] duration-[150ms]",
              filter === src
                ? "bg-[var(--ink)] border-[var(--ink)] text-[var(--bg)]"
                : "bg-[var(--surface)] border-[var(--line)] text-[var(--muted)] hover:border-[var(--ink-2)] hover:text-[var(--ink)]"
            )}
          >
            {src === "all" ? "All" : src}
          </button>
        ))}
      </div>

      {/* Table header — desktop only */}
      <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_1fr_80px] gap-3 px-4 py-2 bg-[var(--surface-2)] border-b border-[var(--line)] font-[var(--font-mono)] text-[10px] uppercase tracking-[.06em] text-[var(--muted)]">
        <span>Name</span>
        <span>Phone</span>
        <span>Source</span>
        <span>Added</span>
        <span className="text-right">Estimates</span>
      </div>

      {/* Rows */}
      {isLoading ? (
        <p className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] py-4">
          Loading…
        </p>
      ) : filtered.length === 0 ? (
        <p className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] py-4">
          No customers yet. Add your first one →
        </p>
      ) : (
        <div className="divide-y divide-[var(--line)]">
          {filtered.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => router.push(`/customers/${c.id}`)}
              className="w-full text-left grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr_80px] gap-x-3 gap-y-0 px-4 py-3 bg-[var(--surface)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
            >
              <div>
                <span className="font-[var(--font-display)] text-[14px] font-[600] text-[var(--ink)] tracking-[-0.01em]">
                  {c.name}
                </span>
                {c.address && (
                  <span className="block font-[var(--font-mono)] text-[11px] text-[var(--muted)] truncate mt-0.5">
                    {c.address}
                  </span>
                )}
                <div className="flex items-center gap-3 mt-1.5 md:hidden">
                  <SourceBadge source={c.source} />
                  <span className="font-[var(--font-mono)] text-[10px] text-[var(--muted)]">
                    {c._count?.estimates ?? 0} estimate
                    {(c._count?.estimates ?? 0) !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>
              <span className="font-[var(--font-mono)] text-[12px] text-[var(--ink-2)] hidden md:block self-center">
                {c.phone ?? "—"}
              </span>
              <span className="hidden md:flex items-center">
                <SourceBadge source={c.source} />
              </span>
              <span className="font-[var(--font-mono)] text-[12px] text-[var(--muted)] hidden md:block self-center">
                {new Date(c.createdAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "2-digit",
                })}
              </span>
              <span className="font-[var(--font-mono)] text-[12px] text-right text-[var(--ink-2)] hidden md:block self-center">
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
        title="New customer"
      >
        <div className="space-y-4">
          {/* Source tabs */}
          <div>
            <label className="font-[var(--font-mono)] text-[10px] uppercase tracking-[.06em] text-[var(--muted)] block mb-2">
              Lead source
            </label>
            <div className="flex flex-wrap gap-1.5">
              {(
                ["phone", "online", "referral", "walkin", "website"] as const
              ).map((src) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, source: src }))}
                  className={cn(
                    "min-h-[36px] px-3 font-[var(--font-mono)] text-[10px] tracking-[.02em]",
                    "border rounded-[6px] transition-[background,border-color,color] duration-[150ms]",
                    form.source === src
                      ? "bg-[var(--ink)] border-[var(--ink)] text-[var(--bg)]"
                      : "bg-[var(--surface)] border-[var(--line)] text-[var(--muted)] hover:border-[var(--ink-2)]"
                  )}
                >
                  {src}
                </button>
              ))}
            </div>
          </div>

          {[
            {
              field: "name" as const,
              label: "Full name *",
              type: "text",
              required: true,
            },
            {
              field: "phone" as const,
              label: "Phone",
              type: "tel",
              required: false,
            },
            {
              field: "email" as const,
              label: "Email",
              type: "email",
              required: false,
            },
            {
              field: "address" as const,
              label: "Address",
              type: "text",
              required: false,
            },
          ].map(({ field, label, type, required }) => (
            <div key={field} className="flex flex-col gap-1">
              <label className="font-[var(--font-mono)] text-[10px] uppercase tracking-[.06em] text-[var(--muted)]">
                {label}
              </label>
              <input
                type={type}
                value={(form[field] as string) ?? ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, [field]: e.target.value }))
                }
                required={required}
                className="border border-[var(--line)] bg-[var(--surface)] px-3 py-2 rounded-[6px] font-[var(--font-mono)] text-[13px] text-[var(--ink)] focus:outline-none focus:border-[var(--accent)] transition-[border-color] duration-[150ms]"
              />
            </div>
          ))}

          <div className="flex flex-col gap-1">
            <label className="font-[var(--font-mono)] text-[10px] uppercase tracking-[.06em] text-[var(--muted)]">
              Notes
            </label>
            <textarea
              rows={3}
              value={form.notes ?? ""}
              onChange={(e) =>
                setForm((f) => ({ ...f, notes: e.target.value }))
              }
              className="border border-[var(--line)] bg-[var(--surface)] px-3 py-2 rounded-[6px] font-[var(--font-mono)] text-[13px] text-[var(--ink)] focus:outline-none focus:border-[var(--accent)] transition-[border-color] duration-[150ms] resize-none"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              variant="primary"
              onClick={handleSave}
              disabled={!form.name.trim() || createCustomer.isPending}
              className="flex-1 justify-center"
            >
              {createCustomer.isPending ? "Saving…" : "Save customer"}
            </Button>
            <Button
              onClick={() => setPanelOpen(false)}
              className="flex-1 justify-center"
            >
              Cancel
            </Button>
          </div>
        </div>
      </SlidePanel>
    </div>
  );
}

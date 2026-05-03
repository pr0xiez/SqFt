"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { SlidePanel } from "@/components/ui/SlidePanel";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import {
  type CreateCustomerInput,
  useCreateCustomer,
} from "@/lib/hooks/useCustomers";

interface NewCustomerPanelProps {
  open: boolean;
  onClose: () => void;
}

export function NewCustomerPanel({ open, onClose }: NewCustomerPanelProps) {
  const createCustomer = useCreateCustomer();
  const { showToast } = useToast();

  const [form, setForm] = useState<CreateCustomerInput>({
    name: "",
    phone: "",
    email: "",
    address: "",
    source: "phone",
    notes: "",
  });

  function resetForm() {
    setForm({
      name: "",
      phone: "",
      email: "",
      address: "",
      source: "phone",
      notes: "",
    });
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    try {
      const created = await createCustomer.mutateAsync(form);
      onClose();
      resetForm();
      showToast(`Customer "${created.name}" added.`);
    } catch {
      showToast("Failed to create customer. Please try again.");
    }
  }

  return (
    <SlidePanel
      open={open}
      onClose={() => {
        onClose();
        resetForm();
      }}
      title="New customer"
    >
      <div className="space-y-4">
        {/* Source tabs */}
        <div>
          <p className="font-[var(--font-mono)] text-[10px] uppercase tracking-[.06em] text-[var(--muted)] block mb-2">
            Lead source
          </p>
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
            <label
              htmlFor={field}
              className="font-[var(--font-mono)] text-[10px] uppercase tracking-[.06em] text-[var(--muted)]"
            >
              {label}
            </label>
            <input
              id={field}
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
          <label
            htmlFor="notes"
            className="font-[var(--font-mono)] text-[10px] uppercase tracking-[.06em] text-[var(--muted)]"
          >
            Notes
          </label>
          <textarea
            id="notes"
            rows={3}
            value={form.notes ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
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
            onClick={() => {
              onClose();
              resetForm();
            }}
            className="flex-1 justify-center"
          >
            Cancel
          </Button>
        </div>
      </div>
    </SlidePanel>
  );
}

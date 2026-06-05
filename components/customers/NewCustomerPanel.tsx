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

const SOURCES = ["phone", "online", "referral", "walkin", "website"] as const;
const SOURCE_LABELS: Record<string, string> = {
  phone: "Phone",
  online: "Online",
  referral: "Referral",
  walkin: "Walk-in",
  website: "Website",
};

export function NewCustomerPanel({ open, onClose }: NewCustomerPanelProps) {
  const createCustomer = useCreateCustomer();
  const { showToast } = useToast();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [form, setForm] = useState<Omit<CreateCustomerInput, "name">>({
    phone: "",
    email: "",
    source: "phone",
    notes: "",
  });

  function resetForm() {
    setFirstName("");
    setLastName("");
    setForm({ phone: "", email: "", source: "phone", notes: "" });
  }

  async function handleSave() {
    const name = `${firstName.trim()} ${lastName.trim()}`.trim();
    if (!name) {
      showToast("Name required", "Please enter a name");
      return;
    }
    try {
      const created = await createCustomer.mutateAsync({ ...form, name });
      onClose();
      resetForm();
      showToast("Customer saved", created.name);
    } catch {
      showToast("Failed to create customer");
    }
  }

  return (
    <SlidePanel
      open={open}
      onClose={() => {
        onClose();
        resetForm();
      }}
      title="New Customer"
      sub="Add a lead to start"
      width="560px"
      footer={
        <>
          <Button
            onClick={() => {
              onClose();
              resetForm();
            }}
            className="flex-1 justify-center"
          >
            Cancel
          </Button>
          <Button
            variant="accent"
            onClick={handleSave}
            disabled={
              (!firstName.trim() && !lastName.trim()) ||
              createCustomer.isPending
            }
            className="flex-1 justify-center"
          >
            {createCustomer.isPending ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Source selector */}
        <div className="grid grid-cols-5 gap-px bg-[var(--line)] border border-[var(--line)] rounded-[5px] overflow-hidden mb-4">
          {SOURCES.map((src) => (
            <button
              key={src}
              type="button"
              onClick={() => setForm((f) => ({ ...f, source: src }))}
              className={cn(
                "py-2 px-1 font-[var(--font-mono)] text-[9px] tracking-[.04em] uppercase cursor-pointer transition-colors duration-150 border-none",
                form.source === src
                  ? "bg-[var(--ink)] text-[var(--bg)]"
                  : "bg-[var(--surface)] text-[var(--muted)]"
              )}
            >
              {SOURCE_LABELS[src]}
            </button>
          ))}
        </div>

        {/* Name */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <div>
            <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.06em] mb-[5px]">
              First name
            </div>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Jordan"
              className="w-full text-[14px] border border-[var(--line)] bg-[var(--surface)] px-2.5 py-2 rounded-[5px] focus:outline-none focus:border-[var(--ink-2)] transition-[border-color] duration-150"
            />
          </div>
          <div>
            <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.06em] mb-[5px]">
              Last name
            </div>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Henderson"
              className="w-full text-[14px] border border-[var(--line)] bg-[var(--surface)] px-2.5 py-2 rounded-[5px] focus:outline-none focus:border-[var(--ink-2)] transition-[border-color] duration-150"
            />
          </div>
        </div>

        {/* Fields */}
        {[
          {
            field: "phone" as const,
            label: "Phone",
            placeholder: "(614) 555-...",
          },
          {
            field: "email" as const,
            label: "Email",
            placeholder: "name@email.com",
          },
        ].map(({ field, label, placeholder }) => (
          <div key={field} className="mb-4">
            <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.06em] mb-[5px]">
              {label}
            </div>
            <input
              type="text"
              value={(form[field] as string) ?? ""}
              onChange={(e) =>
                setForm((f) => ({ ...f, [field]: e.target.value }))
              }
              placeholder={placeholder}
              className="w-full text-[14px] border border-[var(--line)] bg-[var(--surface)] px-2.5 py-2 rounded-[5px] focus:outline-none focus:border-[var(--ink-2)] transition-[border-color] duration-150"
            />
          </div>
        ))}

        <div className="mb-4">
          <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.06em] mb-[5px]">
            Notes
          </div>
          <textarea
            rows={3}
            value={form.notes ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            className="w-full text-[14px] border border-[var(--line)] bg-[var(--surface)] px-2.5 py-2 rounded-[5px] focus:outline-none focus:border-[var(--ink-2)] transition-[border-color] duration-150 resize-none"
          />
        </div>
      </div>
    </SlidePanel>
  );
}

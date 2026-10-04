"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { SlidePanel } from "@/components/ui/SlidePanel";
import { useToast } from "@/components/ui/Toast";
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
  const uid = useId();

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
            variant="primary"
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
      <div className="flex flex-col gap-4">
        <fieldset className="min-w-0 border-0 p-0 m-0">
          <legend className="field-label">Source</legend>
          <div className="seg flex w-full">
            {SOURCES.map((src) => (
              <button
                key={src}
                type="button"
                aria-pressed={form.source === src}
                onClick={() => setForm((f) => ({ ...f, source: src }))}
                className="flex-1 min-w-0 min-h-[34px] px-1 cursor-pointer"
              >
                {SOURCE_LABELS[src]}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor={`${uid}-first`} className="field-label">
              First name
            </label>
            <input
              id={`${uid}-first`}
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Jordan"
              className="field"
            />
          </div>
          <div>
            <label htmlFor={`${uid}-last`} className="field-label">
              Last name
            </label>
            <input
              id={`${uid}-last`}
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Henderson"
              className="field"
            />
          </div>
        </div>

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
          <div key={field}>
            <label htmlFor={`${uid}-${field}`} className="field-label">
              {label}
            </label>
            <input
              id={`${uid}-${field}`}
              type="text"
              value={(form[field] as string) ?? ""}
              onChange={(e) =>
                setForm((f) => ({ ...f, [field]: e.target.value }))
              }
              placeholder={placeholder}
              className="field"
            />
          </div>
        ))}

        <div>
          <label htmlFor={`${uid}-notes`} className="field-label">
            Notes
          </label>
          <textarea
            id={`${uid}-notes`}
            rows={3}
            value={form.notes ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            className="field resize-none"
          />
        </div>
      </div>
    </SlidePanel>
  );
}

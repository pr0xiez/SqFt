"use client";

import { useState } from "react";
import { SourceBadge } from "@/components/ui/SourceBadge";

interface Props {
  customer: {
    name: string;
    phone?: string | null;
    email?: string | null;
    source: string;
    notes?: string | null;
  };
  onField: (field: string, value: string) => void;
}

export function CustomerInfoCard({ customer, onField }: Props) {
  // Customers are stored with a single `name`. The form edits first/last
  // separately (matching the New Customer panel) and rejoins on save.
  const [firstName, setFirstName] = useState(
    () => customer.name.trim().split(/\s+/)[0] ?? ""
  );
  const [lastName, setLastName] = useState(() =>
    customer.name.trim().split(/\s+/).slice(1).join(" ")
  );

  function saveName() {
    onField("name", `${firstName.trim()} ${lastName.trim()}`.trim());
  }

  return (
    <div className="bg-[var(--surface)] border border-[var(--line)] rounded-lg p-6 mb-4">
      <div className="flex items-end gap-3 mb-5">
        <div className="grid grid-cols-2 gap-3 flex-1 min-w-0">
          <div>
            <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.06em] mb-[5px]">
              First name
            </div>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              onBlur={saveName}
              placeholder="Jordan"
              className="w-full text-[14px] font-[600] border border-[var(--line)] bg-[var(--surface)] rounded-[5px] px-2.5 py-2 focus:outline-none focus:border-[var(--ink-2)] transition-[border-color] duration-150"
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
              onBlur={saveName}
              placeholder="Henderson"
              className="w-full text-[14px] font-[600] border border-[var(--line)] bg-[var(--surface)] rounded-[5px] px-2.5 py-2 focus:outline-none focus:border-[var(--ink-2)] transition-[border-color] duration-150"
            />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
        <div>
          <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.06em] mb-[5px]">
            Phone
          </div>
          <input
            type="tel"
            defaultValue={customer.phone ?? ""}
            onBlur={(e) => onField("phone", e.target.value)}
            className="w-full text-[13px] border border-[var(--line)] bg-[var(--surface)] rounded-[5px] px-2.5 py-2 focus:outline-none focus:border-[var(--ink-2)] transition-[border-color] duration-150"
          />
        </div>
        <div>
          <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.06em] mb-[5px]">
            Email
          </div>
          <input
            type="email"
            defaultValue={customer.email ?? ""}
            onBlur={(e) => onField("email", e.target.value)}
            className="w-full text-[13px] border border-[var(--line)] bg-[var(--surface)] rounded-[5px] px-2.5 py-2 focus:outline-none focus:border-[var(--ink-2)] transition-[border-color] duration-150"
          />
        </div>
        <div>
          <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.06em] mb-[5px]">
            Source
          </div>
          <select
            defaultValue={customer.source}
            onChange={(e) => onField("source", e.target.value)}
            className="w-full text-[13px] border border-[var(--line)] bg-[var(--surface)] rounded-[5px] px-2.5 py-2 focus:outline-none focus:border-[var(--ink-2)] transition-[border-color] duration-150"
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
            onBlur={(e) => onField("notes", e.target.value)}
            className="w-full text-[13px] border border-[var(--line)] bg-[var(--surface)] rounded-[5px] px-2.5 py-2 focus:outline-none focus:border-[var(--ink-2)] transition-[border-color] duration-150 resize-y"
          />
        </div>
      </div>
    </div>
  );
}

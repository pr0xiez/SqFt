"use client";

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
  return (
    <div className="bg-[var(--surface)] border border-[var(--line)] rounded-lg p-6 mb-4">
      <div className="flex items-center gap-3 mb-5">
        <input
          type="text"
          defaultValue={customer.name}
          onBlur={(e) => onField("name", e.target.value)}
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
            onBlur={(e) => onField("phone", e.target.value)}
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
            onBlur={(e) => onField("email", e.target.value)}
            className="w-full text-[13px] border-none border-b border-[var(--line)] bg-transparent py-[5px] focus:outline-none focus:border-[var(--ink-2)] transition-[border-color] duration-150"
          />
        </div>
        <div>
          <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.06em] mb-[5px]">
            Source
          </div>
          <select
            defaultValue={customer.source}
            onChange={(e) => onField("source", e.target.value)}
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
            onBlur={(e) => onField("notes", e.target.value)}
            className="w-full text-[13px] border-none border-b border-[var(--line)] bg-transparent py-[5px] focus:outline-none focus:border-[var(--ink-2)] transition-[border-color] duration-150 resize-y"
          />
        </div>
      </div>
    </div>
  );
}

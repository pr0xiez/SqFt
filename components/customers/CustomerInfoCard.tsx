"use client";

import { useId, useState } from "react";

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

  const uid = useId();

  function saveName() {
    onField("name", `${firstName.trim()} ${lastName.trim()}`.trim());
  }

  return (
    <section className="card p-5 md:p-6 mb-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">
        <div>
          <label htmlFor={`${uid}-first`} className="field-label">
            First name
          </label>
          <input
            id={`${uid}-first`}
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            onBlur={saveName}
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
            onBlur={saveName}
            placeholder="Henderson"
            className="field"
          />
        </div>
        <div>
          <label htmlFor={`${uid}-phone`} className="field-label">
            Phone
          </label>
          <input
            id={`${uid}-phone`}
            type="tel"
            defaultValue={customer.phone ?? ""}
            onBlur={(e) => onField("phone", e.target.value)}
            className="field"
          />
        </div>
        <div>
          <label htmlFor={`${uid}-email`} className="field-label">
            Email
          </label>
          <input
            id={`${uid}-email`}
            type="email"
            defaultValue={customer.email ?? ""}
            onBlur={(e) => onField("email", e.target.value)}
            className="field"
          />
        </div>
        <div>
          <label htmlFor={`${uid}-source`} className="field-label">
            Source
          </label>
          <select
            id={`${uid}-source`}
            defaultValue={customer.source}
            onChange={(e) => onField("source", e.target.value)}
            className="field"
          >
            <option value="phone">Phone call</option>
            <option value="online">Online lead</option>
            <option value="referral">Referral</option>
            <option value="walkin">Walk-in</option>
            <option value="website">Website</option>
          </select>
        </div>
        <div className="md:col-span-2">
          <label htmlFor={`${uid}-notes`} className="field-label">
            Notes
          </label>
          <textarea
            id={`${uid}-notes`}
            rows={2}
            defaultValue={customer.notes ?? ""}
            onBlur={(e) => onField("notes", e.target.value)}
            className="field resize-y"
          />
        </div>
      </div>
    </section>
  );
}

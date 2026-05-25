"use client";

import { useState } from "react";
import { useCreateMember } from "@/lib/hooks/useMembers";
import type { MemberRole, MemberRow } from "./types";

const ROLES: MemberRole[] = ["admin", "lead", "crew"];

export function AddMemberForm({
  onCreated,
}: {
  onCreated: (row: MemberRow) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("crew");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const mutation = useCreateMember();

  function reset() {
    setName("");
    setEmail("");
    setRole("crew");
    setPassword("");
    setError(null);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    mutation.mutate(
      { name, email, role, password },
      {
        onSuccess: (row) => {
          onCreated(row);
          reset();
          setOpen(false);
        },
        onError: (err: unknown) => {
          const msg =
            typeof err === "object" && err && "message" in err
              ? String((err as { message: string }).message)
              : "Failed to add member";
          setError(msg);
        },
      }
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[12px] font-[var(--font-mono)] tracking-[.04em] uppercase px-3 py-2 border border-[var(--line)] rounded-[6px] bg-[var(--surface)] hover:bg-[var(--surface-2)]"
      >
        + Invite member
      </button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="border border-[var(--line)] rounded-[var(--r)] bg-[var(--surface)] p-4 grid gap-3"
    >
      <Field label="Name">
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full text-[14px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 rounded-[5px]"
        />
      </Field>
      <Field label="Email">
        <input
          required
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full text-[14px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 rounded-[5px]"
        />
      </Field>
      <Field label="Role">
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as MemberRole)}
          className="w-full text-[14px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 rounded-[5px]"
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r[0]?.toUpperCase() + r.slice(1)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Temporary password">
        <input
          required
          minLength={8}
          type="text"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full text-[14px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 rounded-[5px] font-[var(--font-mono)]"
          placeholder="At least 8 characters"
        />
      </Field>
      {error && <div className="text-[12px] text-[var(--accent)]">{error}</div>}
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          className="text-[12px] font-[var(--font-mono)] tracking-[.04em] uppercase px-3 py-2 border border-[var(--line)] rounded-[6px] bg-[var(--surface)]"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={mutation.isPending}
          className="text-[12px] font-[var(--font-mono)] tracking-[.04em] uppercase px-3 py-2 rounded-[6px] bg-[var(--ink)] text-[var(--bg)] disabled:opacity-50"
        >
          {mutation.isPending ? "Adding…" : "Add member"}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: children contains the control
    <label className="block">
      <div className="text-[10px] font-[var(--font-mono)] tracking-[.06em] uppercase text-[var(--muted)] mb-1">
        {label}
      </div>
      {children}
    </label>
  );
}

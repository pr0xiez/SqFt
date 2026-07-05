"use client";

import { useState } from "react";
import type {
  MemberRole,
  MemberRow,
} from "@/components/settings/members/types";
import {
  type CreateAdminUserInput,
  useCreateAdminOrgMember,
} from "@/lib/hooks/useAdminOrgMembers";
import { suggestPassword } from "@/lib/passwords";

const ROLES: MemberRole[] = ["admin", "lead", "crew"];

export function AddAdminUserForm({
  orgId,
  onCreated,
}: {
  orgId: string;
  onCreated: (row: MemberRow) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("crew");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{
    email: string;
    password: string;
  } | null>(null);
  const mutation = useCreateAdminOrgMember(orgId);

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
    const input: CreateAdminUserInput = { name, email, role, password };
    mutation.mutate(input, {
      onSuccess: (row) => {
        setCreated({ email: row.email, password });
        onCreated(row);
        reset();
      },
      onError: (err: unknown) => {
        const msg =
          typeof err === "object" && err && "message" in err
            ? String((err as { message: string }).message)
            : "Failed to add user";
        setError(msg);
      },
    });
  }

  if (created) {
    return (
      <div className="border border-[var(--line)] rounded-[var(--r)] bg-[var(--surface)] p-4 grid gap-3">
        <div className="text-[10px] font-[var(--font-mono)] tracking-[.06em] uppercase text-[var(--muted)]">
          User created · hand these off out-of-band
        </div>
        <Credentials label="Email" value={created.email} />
        <Credentials label="Temporary password" value={created.password} mono />
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={() => {
              setCreated(null);
              setOpen(false);
            }}
            className="text-[12px] font-[var(--font-mono)] tracking-[.04em] uppercase px-3 py-2 border border-[var(--line)] rounded-[6px] bg-[var(--surface)]"
          >
            Done
          </button>
          <button
            type="button"
            onClick={() => {
              setCreated(null);
              setOpen(true);
            }}
            className="text-[12px] font-[var(--font-mono)] tracking-[.04em] uppercase px-3 py-2 rounded-[6px] bg-[var(--ink)] text-[var(--bg)]"
          >
            Add another
          </button>
        </div>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[12px] font-[var(--font-mono)] tracking-[.04em] uppercase px-3 py-2 border border-[var(--line)] rounded-[6px] bg-[var(--surface)] hover:bg-[var(--surface-2)]"
      >
        + Add user
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
        <div className="flex gap-2">
          <input
            required
            minLength={8}
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="flex-1 text-[14px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 rounded-[5px] font-[var(--font-mono)]"
            placeholder="At least 8 characters"
          />
          <button
            type="button"
            onClick={() => setPassword(suggestPassword())}
            className="text-[11px] font-[var(--font-mono)] tracking-[.04em] uppercase px-3 py-2 border border-[var(--line)] rounded-[5px] bg-[var(--surface)] hover:bg-[var(--surface-2)]"
          >
            Suggest
          </button>
        </div>
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
          {mutation.isPending ? "Adding…" : "Add user"}
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

function Credentials({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="grid grid-cols-[120px_1fr_auto] items-center gap-3">
      <div className="text-[10px] font-[var(--font-mono)] tracking-[.06em] uppercase text-[var(--muted)]">
        {label}
      </div>
      <div
        className={`text-[13px] ${mono ? "font-[var(--font-mono)]" : ""} break-all`}
      >
        {value}
      </div>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
        className="text-[10px] font-[var(--font-mono)] tracking-[.04em] uppercase px-2 py-1 border border-[var(--line)] rounded-[4px] bg-[var(--surface)]"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

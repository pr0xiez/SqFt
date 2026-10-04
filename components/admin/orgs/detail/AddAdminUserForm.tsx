"use client";

import { useState } from "react";
import type {
  MemberRole,
  MemberRow,
} from "@/components/settings/members/types";
import { Button } from "@/components/ui/Button";
import { PlusIcon } from "@/components/ui/icons";
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
      <div className="card p-5 md:p-6 grid gap-4">
        <div className="type-heading">
          User created · hand these off out-of-band
        </div>
        <Credentials label="Email" value={created.email} />
        <Credentials label="Temporary password" value={created.password} mono />
        <div className="flex gap-2 justify-end">
          <Button
            type="button"
            onClick={() => {
              setCreated(null);
              setOpen(true);
            }}
          >
            Add another
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={() => {
              setCreated(null);
              setOpen(false);
            }}
          >
            Done
          </Button>
        </div>
      </div>
    );
  }

  if (!open) {
    return (
      <Button type="button" variant="primary" onClick={() => setOpen(true)}>
        <PlusIcon aria-hidden="true" />
        Add user
      </Button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="card p-5 md:p-6 grid gap-4">
      <Field label="Name">
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="field"
        />
      </Field>
      <Field label="Email">
        <input
          required
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="field"
        />
      </Field>
      <Field label="Role">
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as MemberRole)}
          className="field"
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
            className="field flex-1 min-w-0 type-figure"
            placeholder="At least 8 characters"
          />
          <Button type="button" onClick={() => setPassword(suggestPassword())}>
            Suggest
          </Button>
        </div>
      </Field>
      {error && (
        <div
          role="alert"
          className="rounded-[var(--r)] bg-[var(--accent-wash)] px-3.5 py-2.5 text-[14px] font-[560] text-[var(--accent-ink)]"
        >
          {error}
        </div>
      )}
      <div className="flex gap-2 justify-end">
        <Button
          type="button"
          onClick={() => {
            reset();
            setOpen(false);
          }}
        >
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={mutation.isPending}>
          {mutation.isPending ? "Adding…" : "Add user"}
        </Button>
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
      <span className="field-label">{label}</span>
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
    <div className="grid grid-cols-[minmax(0,110px)_minmax(0,1fr)_auto] md:grid-cols-[160px_minmax(0,1fr)_auto] items-center gap-3">
      <div className="type-label">{label}</div>
      <div className={`text-[14px] ${mono ? "type-figure" : ""} break-all`}>
        {value}
      </div>
      <Button
        type="button"
        size="sm"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
      >
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

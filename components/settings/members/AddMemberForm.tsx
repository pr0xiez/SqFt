"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { UserPlusIcon } from "@/components/ui/icons";
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
      <Button type="button" variant="primary" onClick={() => setOpen(true)}>
        <UserPlusIcon aria-hidden="true" />
        Invite member
      </Button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="card p-5 md:p-6">
      <h2 className="type-heading mb-4">Invite member</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
          <input
            required
            minLength={8}
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="field"
            placeholder="At least 8 characters"
          />
        </Field>
      </div>
      {error && (
        <div className="field-error mt-4" role="alert">
          {error}
        </div>
      )}
      <div className="flex flex-wrap gap-2 justify-end mt-5">
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
          {mutation.isPending ? "Adding…" : "Add member"}
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

"use client";

import { useState } from "react";
import { useCreateAdminOrg } from "@/lib/hooks/useAdminOrgs";
import type { CreateAdminOrgResult } from "./types";

function suggestPassword(): string {
  const alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const out: string[] = [];
  const cryptoObj =
    typeof crypto !== "undefined" && "getRandomValues" in crypto
      ? crypto
      : null;
  if (cryptoObj) {
    const buf = new Uint32Array(16);
    cryptoObj.getRandomValues(buf);
    for (const n of buf) out.push(alphabet[n % alphabet.length] ?? "x");
  } else {
    for (let i = 0; i < 16; i++) {
      out.push(alphabet[Math.floor(Math.random() * alphabet.length)] ?? "x");
    }
  }
  return out.join("");
}

export function CreateOrgForm({
  onCreated,
}: {
  onCreated: (result: CreateAdminOrgResult) => void;
}) {
  const [open, setOpen] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<
    (CreateAdminOrgResult & { password: string }) | null
  >(null);
  const mutation = useCreateAdminOrg();

  function reset() {
    setOrgName("");
    setAdminName("");
    setAdminEmail("");
    setAdminPassword("");
    setError(null);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    mutation.mutate(
      { orgName, adminName, adminEmail, adminPassword },
      {
        onSuccess: (result) => {
          setCreated({ ...result, password: adminPassword });
          onCreated(result);
          reset();
        },
        onError: (err: unknown) => {
          const msg =
            typeof err === "object" && err && "message" in err
              ? String((err as { message: string }).message)
              : "Failed to create organization";
          setError(msg);
        },
      }
    );
  }

  if (created) {
    return (
      <div className="border border-[var(--line)] rounded-[var(--r)] bg-[var(--surface)] p-4 grid gap-3">
        <div className="text-[10px] font-[var(--font-mono)] tracking-[.06em] uppercase text-[var(--muted)]">
          Org created · hand these off out-of-band
        </div>
        <Credentials label="Org" value={created.slug} />
        <Credentials label="Admin email" value={created.adminEmail} />
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
            Create another
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
        + New organization
      </button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="border border-[var(--line)] rounded-[var(--r)] bg-[var(--surface)] p-4 grid gap-3"
    >
      <Field label="Organization name">
        <input
          required
          value={orgName}
          onChange={(e) => setOrgName(e.target.value)}
          className="w-full text-[14px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 rounded-[5px]"
        />
      </Field>
      <Field label="Admin name">
        <input
          required
          value={adminName}
          onChange={(e) => setAdminName(e.target.value)}
          className="w-full text-[14px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 rounded-[5px]"
        />
      </Field>
      <Field label="Admin email">
        <input
          required
          type="email"
          value={adminEmail}
          onChange={(e) => setAdminEmail(e.target.value)}
          className="w-full text-[14px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 rounded-[5px]"
        />
      </Field>
      <Field label="Temporary password">
        <div className="flex gap-2">
          <input
            required
            minLength={8}
            type="text"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            className="flex-1 text-[14px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 rounded-[5px] font-[var(--font-mono)]"
            placeholder="At least 8 characters"
          />
          <button
            type="button"
            onClick={() => setAdminPassword(suggestPassword())}
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
          {mutation.isPending ? "Creating…" : "Create org"}
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

"use client";

import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useState,
} from "react";
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

type SourceId = "phone" | "online" | "referral" | "walkin" | "website";

const SOURCES: {
  id: SourceId;
  label: string;
  glyph: string;
  hint: string;
}[] = [
  { id: "phone", label: "Phone", glyph: "☎", hint: "Inbound call" },
  { id: "online", label: "Online", glyph: "◉", hint: "Lead form" },
  { id: "referral", label: "Referral", glyph: "✦", hint: "Word of mouth" },
  { id: "walkin", label: "Walk-in", glyph: "▲", hint: "Showroom visit" },
  { id: "website", label: "Website", glyph: "❖", hint: "Direct request" },
];

const SOURCE_BORDER: Record<SourceId, string> = {
  phone: "border-l-[var(--sage)]",
  online: "border-l-[var(--gold)]",
  referral: "border-l-[var(--accent)]",
  walkin: "border-l-[var(--muted)]",
  website: "border-l-[var(--ink-2)]",
};

type StepId = "source" | "name" | "contact" | "address" | "notes";

const STEPS: { id: StepId; label: string; prompt: string; sub: string }[] = [
  {
    id: "source",
    label: "Source",
    prompt: "Where did this lead come from?",
    sub: "Pick one — we'll tag it for reporting.",
  },
  {
    id: "name",
    label: "Name",
    prompt: "Who are we talking to?",
    sub: "First name is required. Last name is helpful but optional.",
  },
  {
    id: "contact",
    label: "Contact",
    prompt: "How do we reach them?",
    sub: "Phone or email — at least one keeps the lead reachable.",
  },
  {
    id: "address",
    label: "Address",
    prompt: "Where's the work?",
    sub: "Street and city is enough to plan a visit.",
  },
  {
    id: "notes",
    label: "Notes",
    prompt: "Anything else?",
    sub: "Optional. Anything the crew should know going in.",
  },
];

interface FormState {
  source: SourceId;
  first: string;
  last: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
}

const EMPTY: FormState = {
  source: "phone",
  first: "",
  last: "",
  phone: "",
  email: "",
  address: "",
  notes: "",
};

function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 10);
  if (d.length === 0) return "";
  if (d.length < 4) return `(${d}`;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

export function NewCustomerPanel({ open, onClose }: NewCustomerPanelProps) {
  const createCustomer = useCreateCustomer();
  const { showToast } = useToast();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [stepIdx, setStepIdx] = useState(0);

  const step = STEPS[stepIdx];
  const isLast = stepIdx === STEPS.length - 1;
  const canSave = form.first.trim().length > 0;
  const fullName = `${form.first} ${form.last}`.trim();

  function reset() {
    setForm(EMPTY);
    setStepIdx(0);
  }

  function handleClose() {
    onClose();
    reset();
  }

  async function handleSave() {
    if (!canSave) {
      setStepIdx(STEPS.findIndex((s) => s.id === "name"));
      showToast("First name required");
      return;
    }
    const payload: CreateCustomerInput = {
      name: fullName,
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      address: form.address.trim() || undefined,
      source: form.source,
      notes: form.notes.trim() || undefined,
    };
    try {
      const created = await createCustomer.mutateAsync(payload);
      handleClose();
      showToast("Customer saved", created.name);
    } catch {
      showToast("Failed to create customer");
    }
  }

  function next() {
    if (isLast) {
      void handleSave();
    } else {
      setStepIdx((s) => Math.min(STEPS.length - 1, s + 1));
    }
  }

  function prev() {
    if (stepIdx === 0) handleClose();
    else setStepIdx((s) => Math.max(0, s - 1));
  }

  function handleEnter(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      next();
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: only react to open/close transition
  useEffect(() => {
    if (!open) reset();
  }, [open]);

  return (
    <SlidePanel
      open={open}
      onClose={handleClose}
      title="New Customer"
      sub={`Step ${stepIdx + 1} of ${STEPS.length} · ${step.label}`}
      width="460px"
      footer={
        <>
          <Button onClick={prev} className="flex-1 justify-center">
            {stepIdx === 0 ? "Cancel" : "← Back"}
          </Button>
          <Button
            variant={isLast && canSave ? "accent" : "primary"}
            onClick={next}
            disabled={createCustomer.isPending || (isLast && !canSave)}
            className="flex-1 justify-center"
          >
            {createCustomer.isPending
              ? "Saving…"
              : isLast
                ? "Save customer →"
                : "Continue →"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-7">
        <ProgressRail
          stepIdx={stepIdx}
          completedThrough={maxReachable(form)}
          onJump={setStepIdx}
        />

        {/* Step body — re-keyed for fade-in on each step */}
        <div key={step.id} className="animate-[fade_.22s_var(--ease)]">
          <div className="font-[var(--font-mono)] text-[10px] uppercase tracking-[var(--ls-cap)] text-[var(--accent)] mb-2">
            {step.label}
          </div>
          <h2 className="text-[22px] font-[700] tracking-[var(--ls-tight)] leading-[1.15]">
            {step.prompt}
          </h2>
          <p className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] mt-2">
            {step.sub}
          </p>

          {/* Dashed perforation */}
          <div
            aria-hidden="true"
            className="h-px w-full mt-5 mb-6 bg-[image:repeating-linear-gradient(to_right,var(--line-2)_0,var(--line-2)_4px,transparent_4px,transparent_8px)]"
          />

          {step.id === "source" && (
            <SourceStep
              value={form.source}
              onPick={(id) => setForm((f) => ({ ...f, source: id }))}
            />
          )}

          {step.id === "name" && (
            <NameStep form={form} setForm={setForm} onEnter={handleEnter} />
          )}

          {step.id === "contact" && (
            <ContactStep form={form} setForm={setForm} onEnter={handleEnter} />
          )}

          {step.id === "address" && (
            <AddressStep form={form} setForm={setForm} onEnter={handleEnter} />
          )}

          {step.id === "notes" && <NotesStep form={form} setForm={setForm} />}
        </div>

        <PreviewCard form={form} fullName={fullName} />
      </div>
    </SlidePanel>
  );
}

/* ─── Progress rail ────────────────────────────────────────────── */

function maxReachable(form: FormState): number {
  // Always allow jumping back. Allow forward only if name is set.
  return form.first.trim().length > 0 ? STEPS.length - 1 : 1;
}

function ProgressRail({
  stepIdx,
  completedThrough,
  onJump,
}: {
  stepIdx: number;
  completedThrough: number;
  onJump: (i: number) => void;
}) {
  return (
    <div className="flex items-center gap-2" role="tablist" aria-label="Steps">
      {STEPS.map((s, i) => {
        const active = i === stepIdx;
        const reachable = i <= Math.max(stepIdx, completedThrough);
        return (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={!reachable}
            onClick={() => onJump(i)}
            className={cn(
              "group flex items-center gap-2 cursor-pointer",
              "disabled:cursor-not-allowed"
            )}
          >
            <span
              className={cn(
                "h-[7px] rounded-full transition-all duration-200",
                active
                  ? "w-9 bg-[var(--accent)]"
                  : i < stepIdx
                    ? "w-2.5 bg-[var(--ink)]"
                    : "w-2.5 bg-[var(--line-2)] group-hover:bg-[var(--ink-2)]"
              )}
            />
            <span
              className={cn(
                "font-[var(--font-mono)] text-[9px] uppercase tracking-[var(--ls-cap)] transition-colors",
                active
                  ? "text-[var(--ink)]"
                  : "text-[var(--muted)] group-hover:text-[var(--ink-2)]"
              )}
            >
              {s.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ─── Step 1 · Source ──────────────────────────────────────────── */

function SourceStep({
  value,
  onPick,
}: {
  value: SourceId;
  onPick: (id: SourceId) => void;
}) {
  return (
    <div className="grid grid-cols-5 gap-2">
      {SOURCES.map((s, i) => {
        const active = value === s.id;
        return (
          <button
            // biome-ignore lint/a11y/noAutofocus: first interactive of the step
            autoFocus={i === 0 && active}
            key={s.id}
            type="button"
            onClick={() => onPick(s.id)}
            aria-pressed={active}
            title={s.hint}
            className={cn(
              "relative flex flex-col items-center justify-center gap-1.5",
              "h-[88px] rounded-[var(--r)] border cursor-pointer",
              "transition-[transform,border-color,background] duration-150",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]",
              active
                ? "bg-[var(--surface)] border-[var(--accent)] -translate-y-[1px] shadow-[var(--shadow)]"
                : "bg-[var(--surface-2)] border-[var(--line)] hover:border-[var(--ink-2)] hover:bg-[var(--surface)]"
            )}
          >
            <span
              className={cn(
                "text-[22px] leading-none transition-colors",
                active ? "text-[var(--accent)]" : "text-[var(--ink-2)]"
              )}
            >
              {s.glyph}
            </span>
            <span
              className={cn(
                "font-[var(--font-mono)] text-[9px] uppercase tracking-[var(--ls-cap)]",
                active ? "text-[var(--ink)]" : "text-[var(--muted)]"
              )}
            >
              {s.label}
            </span>
            {active && (
              <span
                aria-hidden="true"
                className="absolute -top-1.5 -right-1.5 font-[var(--font-mono)] text-[8px] tracking-[var(--ls-cap)] uppercase bg-[var(--accent)] text-white px-1.5 py-0.5 rounded-[3px] rotate-[6deg] shadow-[var(--shadow)]"
              >
                Set
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ─── Step 2 · Name ────────────────────────────────────────────── */

function NameStep({
  form,
  setForm,
  onEnter,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  onEnter: (e: ReactKeyboardEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="First name *">
        <input
          // biome-ignore lint/a11y/noAutofocus: first input of the step
          autoFocus
          type="text"
          value={form.first}
          onChange={(e) => setForm((f) => ({ ...f, first: e.target.value }))}
          onKeyDown={onEnter}
          placeholder="Jane"
          className={inputCls}
        />
      </Field>
      <Field label="Last name">
        <input
          type="text"
          value={form.last}
          onChange={(e) => setForm((f) => ({ ...f, last: e.target.value }))}
          onKeyDown={onEnter}
          placeholder="Doe"
          className={inputCls}
        />
      </Field>
    </div>
  );
}

/* ─── Step 3 · Contact ─────────────────────────────────────────── */

function ContactStep({
  form,
  setForm,
  onEnter,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  onEnter: (e: ReactKeyboardEvent<HTMLInputElement>) => void;
}) {
  const phoneDigits = form.phone.replace(/\D/g, "");
  const phoneValid = phoneDigits.length === 10;
  const emailValid = form.email.length === 0 || isValidEmail(form.email);

  return (
    <div className="flex flex-col gap-3">
      <Field
        label="Phone"
        hint={
          phoneValid ? (
            <a
              href={`tel:+1${phoneDigits}`}
              className="text-[var(--accent)] hover:text-[var(--accent-d)] transition-colors no-underline"
            >
              Tap to call →
            </a>
          ) : phoneDigits.length > 0 ? (
            <span>{10 - phoneDigits.length} more digit(s)</span>
          ) : null
        }
      >
        <input
          // biome-ignore lint/a11y/noAutofocus: first input of the step
          autoFocus
          type="tel"
          inputMode="tel"
          value={form.phone}
          onChange={(e) =>
            setForm((f) => ({ ...f, phone: formatPhone(e.target.value) }))
          }
          onKeyDown={onEnter}
          placeholder="(614) 555-0199"
          className={inputCls}
        />
      </Field>
      <Field
        label="Email"
        hint={
          !emailValid ? (
            <span className="text-[var(--accent)]">Not a valid email</span>
          ) : null
        }
      >
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          value={form.email}
          onChange={(e) =>
            setForm((f) => ({ ...f, email: e.target.value.trim() }))
          }
          onKeyDown={onEnter}
          placeholder="jane@email.com"
          className={inputCls}
        />
      </Field>
    </div>
  );
}

/* ─── Step 4 · Address ─────────────────────────────────────────── */

function AddressStep({
  form,
  setForm,
  onEnter,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  onEnter: (e: ReactKeyboardEvent<HTMLInputElement>) => void;
}) {
  return (
    <Field
      label="Street, city"
      hint={
        <span className="text-[var(--muted)]">
          {/* TODO: wire up Google Places autocomplete */}
          Free-text for now — Places lookup coming soon.
        </span>
      }
    >
      <input
        // biome-ignore lint/a11y/noAutofocus: first input of the step
        autoFocus
        type="text"
        autoComplete="street-address"
        value={form.address}
        onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
        onKeyDown={onEnter}
        placeholder="123 Maple St, Columbus OH"
        className={inputCls}
      />
    </Field>
  );
}

/* ─── Step 5 · Notes ───────────────────────────────────────────── */

function NotesStep({
  form,
  setForm,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
}) {
  const count = form.notes.length;
  return (
    <Field
      label="Notes"
      hint={
        <span className="text-[var(--muted)]">
          {count > 0 ? `${count} char${count === 1 ? "" : "s"}` : "Optional"}
        </span>
      }
    >
      <textarea
        // biome-ignore lint/a11y/noAutofocus: first input of the step
        autoFocus
        rows={4}
        value={form.notes}
        onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
        placeholder="Existing flooring, pets, stairs, timeline…"
        className={cn(inputCls, "resize-none leading-[1.45]")}
      />
    </Field>
  );
}

/* ─── Shared bits ──────────────────────────────────────────────── */

const inputCls = cn(
  "w-full text-[15px] bg-[var(--surface)] border border-[var(--line)]",
  "px-3 py-2.5 rounded-[var(--r)]",
  "focus:outline-none focus:border-[var(--ink)] focus:bg-[var(--bg)]",
  "transition-[border-color,background] duration-150",
  "placeholder:text-[var(--muted)] placeholder:font-[var(--font-mono)] placeholder:text-[13px]"
);

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: input is passed in as children, biome can't see through the prop
    <label className="block">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="font-[var(--font-mono)] text-[10px] uppercase tracking-[var(--ls-cap)] text-[var(--muted)]">
          {label}
        </span>
        {hint && (
          <span className="font-[var(--font-mono)] text-[10px] tracking-[var(--ls-mono)]">
            {hint}
          </span>
        )}
      </div>
      {children}
    </label>
  );
}

/* ─── Live preview ─────────────────────────────────────────────── */

function PreviewCard({
  form,
  fullName,
}: {
  form: FormState;
  fullName: string;
}) {
  const source = SOURCES.find((s) => s.id === form.source) ?? SOURCES[0];
  const empty = !fullName && !form.phone && !form.email && !form.address;

  return (
    <div className="mt-2">
      <div className="flex items-center gap-2 mb-2">
        <div className="font-[var(--font-mono)] text-[9px] uppercase tracking-[var(--ls-cap)] text-[var(--muted)]">
          Preview
        </div>
        <div className="h-px flex-1 bg-[var(--line)]" />
      </div>
      <div
        className={cn(
          "bg-[var(--surface)] border border-[var(--line)] rounded-[var(--r-lg)]",
          "border-l-[3px]",
          SOURCE_BORDER[form.source],
          "p-3.5 flex items-start justify-between gap-3",
          "shadow-[var(--shadow)]"
        )}
      >
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              "text-[15px] font-[600] tracking-[var(--ls-snug)] mb-0.5 truncate",
              empty ? "text-[var(--muted)]" : "text-[var(--ink)]"
            )}
          >
            {fullName || "New customer"}
          </div>
          <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] truncate">
            {[form.phone, form.email].filter(Boolean).join(" · ") ||
              "No contact yet"}
          </div>
          {form.address && (
            <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] truncate mt-0.5">
              {form.address}
            </div>
          )}
        </div>
        <span className="shrink-0 font-[var(--font-mono)] text-[9px] uppercase tracking-[var(--ls-cap)] text-[var(--muted)] border border-[var(--line)] px-2 py-1 rounded-[4px]">
          {source.glyph} {source.label}
        </span>
      </div>
    </div>
  );
}

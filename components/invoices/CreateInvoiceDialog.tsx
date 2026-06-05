"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useCreateInvoice } from "@/lib/hooks/useInvoices";
import { fmtDollar } from "@/lib/utils";

type Mode = "remaining" | "pct" | "flat";

interface Props {
  estimateId: number;
  unbilled: number;
  defaultDepositPct: number; // decimal, e.g. 0.3
  open: boolean;
  onClose: () => void;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const labelCls =
  "block text-[10px] font-[var(--font-mono)] uppercase tracking-[.06em] text-[var(--muted)] mb-1";
const inputCls =
  "w-full text-[14px] border border-[var(--line-2)] bg-[var(--surface)] px-3 py-2 rounded mb-3 focus:outline-none focus:border-[var(--ink)]";

export function CreateInvoiceDialog({
  estimateId,
  unbilled,
  defaultDepositPct,
  open,
  onClose,
}: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const create = useCreateInvoice(estimateId);

  const [mode, setMode] = useState<Mode>("remaining");
  const [pct, setPct] = useState(String(Math.round(defaultDepositPct * 100)));
  const [flat, setFlat] = useState("0");
  const [dueDate, setDueDate] = useState("");
  const [memo, setMemo] = useState("");
  const [coverNote, setCoverNote] = useState("");
  const [terms, setTerms] = useState("");
  const [showMore, setShowMore] = useState(false);

  useEffect(() => {
    if (open) {
      setMode("remaining");
      setPct(String(Math.round(defaultDepositPct * 100)));
      setFlat("0");
      setDueDate("");
      setMemo("");
      setCoverNote("");
      setTerms("");
      setShowMore(false);
    }
  }, [open, defaultDepositPct]);

  const amount =
    mode === "remaining"
      ? round2(unbilled)
      : mode === "pct"
        ? round2((unbilled * (parseFloat(pct) || 0)) / 100)
        : round2(parseFloat(flat) || 0);

  const leaves = round2(unbilled - amount);
  const overBill = amount > unbilled + 0.005;
  const canSubmit = amount > 0 && !overBill && !create.isPending;

  async function onCreate() {
    try {
      const created = await create.mutateAsync({
        amount,
        memo: memo.trim() || undefined,
        dueDate: dueDate
          ? new Date(`${dueDate}T00:00:00`).toISOString()
          : undefined,
        coverNote: coverNote.trim() || undefined,
        terms: terms.trim() || undefined,
      });
      showToast("Invoice draft created");
      onClose();
      router.push(`/invoices/${created.id}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Create failed");
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New invoice" maxWidth="480px">
      <span className={labelCls}>Bill by</span>
      <div className="flex border border-[var(--line-2)] rounded overflow-hidden mb-3">
        {(
          [
            ["remaining", "Remaining balance"],
            ["pct", "% of balance"],
            ["flat", "Flat amount"],
          ] as [Mode, string][]
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`flex-1 text-[12px] py-2 ${
              mode === m
                ? "bg-[var(--ink)] text-[var(--bg)]"
                : "bg-[var(--surface)] text-[var(--ink-2)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "pct" ? (
        <div className="flex items-center gap-2 mb-3">
          <input
            aria-label="Percent of balance"
            type="number"
            className="w-[100px] text-[14px] border border-[var(--line-2)] bg-[var(--surface)] px-3 py-2 rounded focus:outline-none focus:border-[var(--ink)]"
            value={pct}
            onChange={(e) => setPct(e.target.value)}
          />
          <span className="text-[13px] text-[var(--ink-2)]">
            % of {fmtDollar(unbilled)} remaining
          </span>
        </div>
      ) : null}

      {mode === "flat" ? (
        <>
          <label className={labelCls} htmlFor="flat-amount">
            Amount
          </label>
          <input
            id="flat-amount"
            aria-label="Amount"
            type="number"
            className={inputCls}
            value={flat}
            onChange={(e) => setFlat(e.target.value)}
          />
        </>
      ) : null}

      <div className="rounded bg-[var(--surface-2)] px-3 py-2.5 mb-4">
        <div className="text-[10px] font-[var(--font-mono)] uppercase tracking-[.06em] text-[var(--muted)]">
          This invoice
        </div>
        <div className="text-[22px] font-[700] tracking-[-0.02em]">
          {fmtDollar(amount)}
        </div>
        {overBill ? (
          <div className="text-[11px] text-[var(--accent)] mt-0.5">
            Exceeds the {fmtDollar(unbilled)} unbilled balance.
          </div>
        ) : (
          <div className="text-[11px] text-[var(--muted)] mt-0.5">
            Leaves {fmtDollar(leaves)} unbilled
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <div className="flex-1">
          <label className={labelCls} htmlFor="due-date">
            Due date (optional)
          </label>
          <input
            id="due-date"
            type="date"
            className={inputCls}
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
        <div className="flex-1">
          <label className={labelCls} htmlFor="memo">
            Memo (optional)
          </label>
          <input
            id="memo"
            type="text"
            className={inputCls}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="Deposit"
          />
        </div>
      </div>

      <button
        type="button"
        className="text-[12px] text-[var(--accent)] mb-3"
        onClick={() => setShowMore((s) => !s)}
      >
        {showMore ? "− Cover note & terms" : "+ Cover note & terms"}
      </button>
      {showMore ? (
        <>
          <label className={labelCls} htmlFor="cover-note">
            Cover note
          </label>
          <textarea
            id="cover-note"
            className={`${inputCls} min-h-[70px] resize-y`}
            value={coverNote}
            onChange={(e) => setCoverNote(e.target.value)}
          />
          <label className={labelCls} htmlFor="terms">
            Terms
          </label>
          <textarea
            id="terms"
            className={`${inputCls} min-h-[70px] resize-y`}
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
          />
        </>
      ) : null}

      <div className="flex justify-end gap-2 mt-2">
        <Button variant="ghost" onClick={onClose} type="button">
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={onCreate}
          disabled={!canSubmit}
          type="button"
        >
          {create.isPending ? "Creating…" : "Create draft →"}
        </Button>
      </div>
    </Modal>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ArrowRightIcon, MinusIcon, PlusIcon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useCreateInvoice } from "@/lib/hooks/useInvoices";
import {
  deriveInvoiceAmount,
  invoiceLeaves,
  isOverbill,
  type InvoiceFormMode as Mode,
} from "@/lib/invoices";
import { fmtDollar } from "@/lib/utils";

interface Props {
  estimateId: number;
  unbilled: number;
  defaultDepositPct: number; // decimal, e.g. 0.3
  /** How the form opens: "pct" pre-sizes a deposit, "remaining" (the
   *  default) bills the whole balance. */
  initialMode?: Mode;
  /** Pre-filled memo, e.g. "Deposit" or "Final balance". */
  initialMemo?: string;
  open: boolean;
  onClose: () => void;
}

export function CreateInvoiceDialog({
  estimateId,
  unbilled,
  defaultDepositPct,
  initialMode = "remaining",
  initialMemo = "",
  open,
  onClose,
}: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const create = useCreateInvoice(estimateId);

  const [mode, setMode] = useState<Mode>(initialMode);
  const [pct, setPct] = useState(String(Math.round(defaultDepositPct * 100)));
  const [flat, setFlat] = useState("0");
  const [dueDate, setDueDate] = useState("");
  const [memo, setMemo] = useState(initialMemo);
  const [coverNote, setCoverNote] = useState("");
  const [terms, setTerms] = useState("");
  const [showMore, setShowMore] = useState(false);

  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setPct(String(Math.round(defaultDepositPct * 100)));
      setFlat("0");
      setDueDate("");
      setMemo(initialMemo);
      setCoverNote("");
      setTerms("");
      setShowMore(false);
    }
  }, [open, defaultDepositPct, initialMode, initialMemo]);

  const amount = deriveInvoiceAmount({ mode, unbilled, pct, flat });
  const leaves = invoiceLeaves(unbilled, amount);
  const overBill = isOverbill(amount, unbilled);
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
      <span className="field-label">Bill by</span>
      <div className="seg flex w-full mb-4">
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
            aria-pressed={mode === m}
            onClick={() => setMode(m)}
            className="flex-1 min-h-[36px] px-2 text-center"
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "pct" ? (
        <div className="flex items-center gap-2.5 mb-4">
          <input
            aria-label="Percent of balance"
            type="number"
            className="field w-[100px] type-figure"
            value={pct}
            onChange={(e) => setPct(e.target.value)}
          />
          <span className="text-[14px] text-[var(--ink-2)]">
            % of <span className="type-figure">{fmtDollar(unbilled)}</span>{" "}
            remaining
          </span>
        </div>
      ) : null}

      {mode === "flat" ? (
        <div className="mb-4">
          <label className="field-label" htmlFor="flat-amount">
            Amount
          </label>
          <input
            id="flat-amount"
            aria-label="Amount"
            type="number"
            className="field type-figure"
            value={flat}
            onChange={(e) => setFlat(e.target.value)}
          />
        </div>
      ) : null}

      <div className="rounded-[var(--r)] border border-[var(--line)] bg-[var(--bg)] px-4 py-3.5 mb-5">
        <div className="type-label">This invoice</div>
        <div className="type-stat text-[28px] mt-1.5 text-[var(--ink)]">
          {fmtDollar(amount)}
        </div>
        {overBill ? (
          <div className="field-error mt-1.5">
            Exceeds the {fmtDollar(unbilled)} unbilled balance.
          </div>
        ) : (
          <div className="text-[13px] text-[var(--muted)] mt-1.5">
            Leaves {fmtDollar(leaves)} unbilled
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-4 mb-3">
        <div>
          <label className="field-label" htmlFor="due-date">
            Due date (optional)
          </label>
          <input
            id="due-date"
            type="date"
            className="field"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
        <div>
          <label className="field-label" htmlFor="memo">
            Memo (optional)
          </label>
          <input
            id="memo"
            type="text"
            className="field"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="Deposit"
          />
        </div>
      </div>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="-ml-3 mb-2"
        aria-expanded={showMore}
        onClick={() => setShowMore((s) => !s)}
      >
        {showMore ? (
          <MinusIcon aria-hidden="true" />
        ) : (
          <PlusIcon aria-hidden="true" />
        )}
        Cover note & terms
      </Button>
      {showMore ? (
        <div className="flex flex-col gap-4 mb-2">
          <div>
            <label className="field-label" htmlFor="cover-note">
              Cover note
            </label>
            <textarea
              id="cover-note"
              className="field min-h-[80px] resize-y"
              value={coverNote}
              onChange={(e) => setCoverNote(e.target.value)}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="terms">
              Terms
            </label>
            <textarea
              id="terms"
              className="field min-h-[80px] resize-y"
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
            />
          </div>
        </div>
      ) : null}

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-4">
        <Button variant="default" onClick={onClose} type="button">
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={onCreate}
          disabled={!canSubmit}
          type="button"
        >
          {create.isPending ? "Creating…" : "Create draft"}
          {create.isPending ? null : <ArrowRightIcon aria-hidden="true" />}
        </Button>
      </div>
    </Modal>
  );
}

"use client";

import { QUICK_CREATE_ENTRIES } from "@/components/quick-create/entries";
import { useQuickCreate } from "@/components/quick-create/QuickCreateProvider";
import { CaretRightIcon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/Modal";

/**
 * The phone version of the "+ New" menu: a bottom sheet opened from the tab
 * bar's New cell, listing every quick-create action with a one-line hint.
 */
export function NewSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { open: openQuickCreate } = useQuickCreate();
  return (
    <Modal open={open} onClose={onClose} title="New" maxWidth="440px">
      <ul className="-mx-2 -mt-2">
        {QUICK_CREATE_ENTRIES.map((e) => {
          const EntryIcon = e.icon;
          return (
            <li key={e.kind}>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  openQuickCreate(e.kind);
                }}
                className="group w-full flex items-center gap-3 text-left px-2 py-2.5 min-h-[56px] rounded-[var(--r)] cursor-pointer hover:bg-[var(--hover)] active:bg-[var(--press)]"
              >
                <span className="size-10 shrink-0 rounded-[var(--r)] bg-[var(--surface-2)] flex items-center justify-center text-[var(--ink)]">
                  <EntryIcon aria-hidden="true" className="size-[19px]" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] font-[600] tracking-[-0.01em]">
                    {e.label}
                  </span>
                  <span className="block text-[13px] text-[var(--muted)]">
                    {e.hint}
                  </span>
                </span>
                <CaretRightIcon
                  aria-hidden="true"
                  className="size-4 text-[var(--muted)]"
                />
              </button>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}

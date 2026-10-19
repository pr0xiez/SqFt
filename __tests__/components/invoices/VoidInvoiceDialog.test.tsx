// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VoidInvoiceDialog } from "@/components/invoices/VoidInvoiceDialog";

const mutateAsync = vi.fn();
const showToast = vi.fn();
let isPending = false;
const useVoidInvoice = vi.fn();

vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ showToast }),
}));
vi.mock("@/lib/hooks/useInvoices", () => ({
  useVoidInvoice: (...args: unknown[]) => useVoidInvoice(...args),
}));

function renderDialog() {
  const onClose = vi.fn();
  render(
    <VoidInvoiceDialog
      invoiceId={7}
      estimateId={3}
      invoiceNumber={42}
      open
      onClose={onClose}
    />
  );
  return onClose;
}

describe("VoidInvoiceDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isPending = false;
    useVoidInvoice.mockImplementation(() => ({ mutateAsync, isPending }));
    mutateAsync.mockResolvedValue(undefined);
  });

  it("targets the right invoice and names it in the title", () => {
    renderDialog();
    expect(useVoidInvoice).toHaveBeenCalledWith(7, 3);
    expect(screen.getByText("Void invoice #42?")).toBeTruthy();
  });

  it("voids, toasts and closes on confirm", async () => {
    const onClose = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Void invoice" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith("Invoice voided");
  });

  it("does not mutate on Cancel", () => {
    const onClose = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("does not mutate on Escape", () => {
    const onClose = renderDialog();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("shows the error toast and stays open on failure", async () => {
    mutateAsync.mockRejectedValue(new Error("Already paid"));
    const onClose = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Void invoice" }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith("Already paid"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("disables confirm while pending", () => {
    isPending = true;
    renderDialog();
    const btn = screen.getByRole("button", {
      name: "Voiding…",
    }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});

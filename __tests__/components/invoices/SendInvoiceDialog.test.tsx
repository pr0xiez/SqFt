// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SendInvoiceDialog } from "@/components/invoices/SendInvoiceDialog";

const mutateAsync = vi.fn();
const showToast = vi.fn();
const useSendInvoice = vi.fn();
let isPending = false;

vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ showToast }),
}));
vi.mock("@/lib/hooks/useInvoices", () => ({
  useSendInvoice: (...args: unknown[]) => useSendInvoice(...args),
}));

function renderDialog(
  props: Partial<React.ComponentProps<typeof SendInvoiceDialog>> = {}
) {
  const onClose = vi.fn();
  render(
    <SendInvoiceDialog
      invoiceId={9}
      estimateId={4}
      invoiceNumber={31}
      customerEmail="janet@example.com"
      alreadySent={false}
      open
      onClose={onClose}
      {...props}
    />
  );
  return onClose;
}

const actionBtn = () =>
  screen.getByRole("button", {
    name: /^(Send|Resend|Sending…)$/,
  }) as HTMLButtonElement;

describe("SendInvoiceDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isPending = false;
    useSendInvoice.mockImplementation(() => ({ mutateAsync, isPending }));
    mutateAsync.mockResolvedValue(undefined);
  });

  it("targets the right invoice and prefills recipient and subject", () => {
    renderDialog();
    expect(useSendInvoice).toHaveBeenCalledWith(9, 4);
    expect((screen.getByLabelText("To") as HTMLInputElement).value).toBe(
      "janet@example.com"
    );
    expect((screen.getByLabelText("Subject") as HTMLInputElement).value).toBe(
      "Invoice #31"
    );
  });

  it("disables send for a missing or invalid recipient", () => {
    renderDialog({ customerEmail: null });
    expect(actionBtn().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "x@y" } });
    expect(actionBtn().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("To"), {
      target: { value: "a@b.co" },
    });
    expect(actionBtn().disabled).toBe(false);
  });

  it("sends the trimmed payload, toasts and closes", async () => {
    const onClose = renderDialog();
    fireEvent.change(screen.getByLabelText("To"), {
      target: { value: "  a@b.co " },
    });
    fireEvent.click(actionBtn());
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith({
      to: "a@b.co",
      subject: "Invoice #31",
    });
    expect(showToast).toHaveBeenCalledWith("Invoice sent");
  });

  it("uses resend wording when already sent", async () => {
    const onClose = renderDialog({ alreadySent: true });
    expect(screen.getByText("Resend invoice")).toBeTruthy();
    fireEvent.click(actionBtn());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(showToast).toHaveBeenCalledWith("Invoice resent");
  });

  it("surfaces an email failure as a toast and stays open", async () => {
    mutateAsync.mockRejectedValue(new Error("Email failed to send"));
    const onClose = renderDialog();
    fireEvent.click(actionBtn());
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith("Email failed to send")
    );
    expect(showToast).not.toHaveBeenCalledWith("Invoice sent");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Cancel closes without sending", () => {
    const onClose = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("disables send while pending", () => {
    isPending = true;
    renderDialog();
    expect(actionBtn().disabled).toBe(true);
  });
});

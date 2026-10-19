// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SendEstimateDialog } from "@/components/estimates/SendEstimateDialog";

const mutateAsync = vi.fn();
const showToast = vi.fn();
let isPending = false;

vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ showToast }),
}));
vi.mock("@/lib/hooks/useEstimates", () => ({
  useSendEstimate: () => ({ mutateAsync, isPending }),
}));

function renderDialog(
  props: Partial<React.ComponentProps<typeof SendEstimateDialog>> = {}
) {
  const onClose = vi.fn();
  render(
    <SendEstimateDialog
      estimateId={5}
      estimateNumber={12}
      orgName="Acme Floors"
      customerEmail="janet@example.com"
      hasToken={false}
      open
      onClose={onClose}
      {...props}
    />
  );
  return onClose;
}

const sendBtn = () =>
  screen.getByRole("button", {
    name: /Send estimate|Sending/,
  }) as HTMLButtonElement;

describe("SendEstimateDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isPending = false;
    mutateAsync.mockResolvedValue({ customerEmailSaved: true });
  });

  it("prefills recipient and subject", () => {
    renderDialog();
    expect((screen.getByLabelText("To") as HTMLInputElement).value).toBe(
      "janet@example.com"
    );
    expect((screen.getByLabelText("Subject") as HTMLInputElement).value).toBe(
      "Estimate #12 from Acme Floors"
    );
  });

  it("disables send for a missing or invalid recipient", () => {
    renderDialog({ customerEmail: null });
    expect(sendBtn().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("To"), {
      target: { value: "not-an-email" },
    });
    expect(sendBtn().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("To"), {
      target: { value: "a@b.co" },
    });
    expect(sendBtn().disabled).toBe(false);
  });

  it("sends the trimmed payload, toasts and closes", async () => {
    const onClose = renderDialog();
    fireEvent.change(screen.getByLabelText("Message (optional)"), {
      target: { value: "  Hello  " },
    });
    fireEvent.click(sendBtn());
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith({
      to: "janet@example.com",
      subject: "Estimate #12 from Acme Floors",
      message: "Hello",
      regenerateLink: undefined,
    });
    expect(showToast).toHaveBeenCalledWith("Estimate sent");
  });

  it("only offers link regeneration when a token exists", () => {
    renderDialog();
    expect(screen.queryByLabelText(/Generate a new link/)).toBeNull();
  });

  it("sends regenerateLink when the box is checked", async () => {
    const onClose = renderDialog({ hasToken: true });
    fireEvent.click(screen.getByLabelText(/Generate a new link/));
    fireEvent.click(sendBtn());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ regenerateLink: true })
    );
  });

  it("warns when the customer email could not be saved", async () => {
    mutateAsync.mockResolvedValue({ customerEmailSaved: false });
    renderDialog();
    fireEvent.click(sendBtn());
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        "Estimate sent",
        expect.stringContaining("customer's saved email")
      )
    );
  });

  it("surfaces an email failure as a toast and stays open", async () => {
    mutateAsync.mockRejectedValue(new Error("Email failed to send"));
    const onClose = renderDialog();
    fireEvent.click(sendBtn());
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith("Email failed to send")
    );
    expect(showToast).not.toHaveBeenCalledWith("Estimate sent");
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
    expect(sendBtn().disabled).toBe(true);
  });
});

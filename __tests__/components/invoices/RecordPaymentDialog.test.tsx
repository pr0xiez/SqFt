// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { RecordPaymentDialog } from "@/components/invoices/RecordPaymentDialog";

vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

describe("RecordPaymentDialog", () => {
  it("defaults the amount to the full outstanding balance", () => {
    render(
      wrap(
        <RecordPaymentDialog
          invoiceId={1}
          estimateId={2}
          outstanding={2400}
          open
          onClose={() => {}}
        />
      )
    );
    const input = screen.getByLabelText("Amount") as HTMLInputElement;
    expect(input.value).toBe("2400");
  });

  it("does not offer stripe as a manual method", () => {
    render(
      wrap(
        <RecordPaymentDialog
          invoiceId={1}
          estimateId={2}
          outstanding={2400}
          open
          onClose={() => {}}
        />
      )
    );
    const select = screen.getByLabelText("Method") as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).not.toContain("stripe");
    expect(values).toContain("check");
  });
});

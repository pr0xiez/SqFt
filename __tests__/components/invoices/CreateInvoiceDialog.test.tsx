// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { CreateInvoiceDialog } from "@/components/invoices/CreateInvoiceDialog";

vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

describe("CreateInvoiceDialog", () => {
  it("defaults to Remaining balance and previews the full unbilled amount", () => {
    render(
      wrap(
        <CreateInvoiceDialog
          estimateId={1}
          unbilled={4000}
          defaultDepositPct={0.3}
          open
          onClose={() => {}}
        />
      )
    );
    expect(screen.getByText(/\$4000\.00/)).toBeDefined();
    expect(screen.getByText(/Leaves \$0/)).toBeDefined();
  });

  it("switches to % of balance and previews the org default deposit", () => {
    render(
      wrap(
        <CreateInvoiceDialog
          estimateId={1}
          unbilled={4000}
          defaultDepositPct={0.3}
          open
          onClose={() => {}}
        />
      )
    );
    fireEvent.click(screen.getByRole("button", { name: "% of balance" }));
    // 30% of 4000 = 1200
    expect(screen.getByText(/\$1200\.00/)).toBeDefined();
  });

  it("warns when a flat amount exceeds the unbilled balance", () => {
    render(
      wrap(
        <CreateInvoiceDialog
          estimateId={1}
          unbilled={4000}
          defaultDepositPct={0.3}
          open
          onClose={() => {}}
        />
      )
    );
    fireEvent.click(screen.getByRole("button", { name: "Flat amount" }));
    const input = screen.getByLabelText("Amount");
    fireEvent.change(input, { target: { value: "9999" } });
    expect(screen.getByText(/exceeds/i)).toBeDefined();
  });
});

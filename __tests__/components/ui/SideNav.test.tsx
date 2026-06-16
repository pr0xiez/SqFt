// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/estimates" }));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { name: "Alex Lead", role: "lead" } } }),
  signOut: vi.fn(),
}));

import { SideNav } from "@/components/ui/SideNav";

// SideNav renders AccountBlock, whose logout handler reads the query client.
function withQueryClient(ui: ReactNode) {
  return (
    <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>
  );
}

beforeEach(() => localStorage.clear());

describe("SideNav", () => {
  it("renders grouped destinations when expanded", () => {
    render(withQueryClient(<SideNav />));
    expect(screen.getByText("Pipeline")).toBeInTheDocument();
    expect(screen.getByText("Customers")).toBeInTheDocument();
  });

  it("collapsing hides group labels and persists the state", () => {
    render(withQueryClient(<SideNav />));
    fireEvent.click(screen.getByRole("button", { name: /collapse sidebar/i }));
    expect(screen.queryByText("Pipeline")).not.toBeInTheDocument();
    expect(localStorage.getItem("sqft.sidebar.collapsed")).toBe("1");
  });
});

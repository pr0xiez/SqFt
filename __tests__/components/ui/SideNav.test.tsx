// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/estimates" }));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { name: "Alex Lead", role: "lead" } } }),
  signOut: vi.fn(),
}));

import { QuickCreateProvider } from "@/components/quick-create/QuickCreateProvider";
import { SideNav } from "@/components/ui/SideNav";

beforeEach(() => localStorage.clear());

// The nav hosts AccountBlock, which drops the query cache on sign-out — so it
// needs the same QueryClient the app always has around it.
function renderSideNav() {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <QuickCreateProvider>
        <SideNav />
      </QuickCreateProvider>
    </QueryClientProvider>
  );
}

describe("SideNav", () => {
  it("renders grouped destinations when expanded", () => {
    renderSideNav();
    expect(screen.getByText("Pipeline")).toBeInTheDocument();
    expect(screen.getByText("Customers")).toBeInTheDocument();
  });

  it("collapsing hides group labels and persists the state", () => {
    renderSideNav();
    fireEvent.click(screen.getByRole("button", { name: /collapse sidebar/i }));
    expect(screen.queryByText("Pipeline")).not.toBeInTheDocument();
    expect(localStorage.getItem("sqft.sidebar.collapsed")).toBe("1");
  });
});

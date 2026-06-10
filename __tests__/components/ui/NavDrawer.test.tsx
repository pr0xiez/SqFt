// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { name: "Alex Lead", role: "lead" } } }),
  signOut: vi.fn(),
}));

import { NavDrawer } from "@/components/ui/NavDrawer";

describe("NavDrawer", () => {
  it("renders the full grouped menu when open", () => {
    render(
      // biome-ignore lint/a11y/useValidAriaRole: role is a custom prop on NavDrawer, not an HTML aria role
      <NavDrawer open onClose={() => {}} role="lead" pathname="/estimates" />
    );
    expect(screen.getByText("Customers")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("calls onClose when the scrim is clicked", () => {
    const onClose = vi.fn();
    render(
      // biome-ignore lint/a11y/useValidAriaRole: role is a custom prop on NavDrawer, not an HTML aria role
      <NavDrawer open onClose={onClose} role="lead" pathname="/estimates" />
    );
    fireEvent.click(screen.getByTestId("nav-drawer-scrim"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose on Escape", () => {
    const onClose = vi.fn();
    render(
      // biome-ignore lint/a11y/useValidAriaRole: role is a custom prop on NavDrawer, not an HTML aria role
      <NavDrawer open onClose={onClose} role="lead" pathname="/estimates" />
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

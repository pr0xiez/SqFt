// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NavMenu } from "@/components/ui/NavMenu";

describe("NavMenu", () => {
  it("renders all lead destinations grouped, plus Settings", () => {
    // biome-ignore lint/a11y/useValidAriaRole: role is a custom prop on NavMenu, not an HTML aria role
    render(<NavMenu role="lead" pathname="/estimates" />);
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Customers")).toBeInTheDocument();
    expect(screen.getByText("Site Measures")).toBeInTheDocument();
    expect(screen.getByText("Estimates")).toBeInTheDocument();
    expect(screen.getByText("Schedule Manager")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("hides lead-only destinations and Settings from crew", () => {
    // biome-ignore lint/a11y/useValidAriaRole: role is a custom prop on NavMenu, not an HTML aria role
    render(<NavMenu role="crew" pathname="/my-schedule" />);
    expect(screen.getByText("My Schedule")).toBeInTheDocument();
    expect(screen.queryByText("Customers")).not.toBeInTheDocument();
    expect(screen.queryByText("Schedule Manager")).not.toBeInTheDocument();
    expect(screen.queryByText("Settings")).not.toBeInTheDocument();
  });

  it("marks the active destination with aria-current", () => {
    // biome-ignore lint/a11y/useValidAriaRole: role is a custom prop on NavMenu, not an HTML aria role
    render(<NavMenu role="lead" pathname="/estimates/9" />);
    expect(screen.getByRole("link", { name: /Estimates/ })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(screen.getByRole("link", { name: /Customers/ })).not.toHaveAttribute(
      "aria-current"
    );
  });

  it("fires onNavigate when a link is clicked", () => {
    const onNavigate = vi.fn();
    // biome-ignore lint/a11y/useValidAriaRole: role is a custom prop on NavMenu, not an HTML aria role
    render(<NavMenu role="lead" pathname="/" onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole("link", { name: /Customers/ }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it("hides Admin from a non-super-admin", () => {
    // biome-ignore lint/a11y/useValidAriaRole: role is a custom prop on NavMenu, not an HTML aria role
    render(<NavMenu role="admin" pathname="/" />);
    expect(screen.queryByText("Admin")).not.toBeInTheDocument();
  });

  it("shows Admin to a super-admin", () => {
    // biome-ignore lint/a11y/useValidAriaRole: role is a custom prop on NavMenu, not an HTML aria role
    render(<NavMenu role="admin" pathname="/" isSuperAdmin />);
    expect(screen.getByRole("link", { name: /Admin/ })).toHaveAttribute(
      "href",
      "/admin"
    );
  });
});

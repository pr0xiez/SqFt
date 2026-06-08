// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MobileTabBar } from "@/components/ui/MobileTabBar";

describe("MobileTabBar", () => {
  it("renders the four shortcuts plus More", () => {
    render(<MobileTabBar pathname="/" onMore={() => {}} />);
    for (const label of [
      "Home",
      "Customers",
      "Estimates",
      "Schedule",
      "More",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("marks the shortcut that owns the route as active", () => {
    render(<MobileTabBar pathname="/estimates/9" onMore={() => {}} />);
    expect(screen.getByRole("link", { name: /Estimates/ })).toHaveAttribute(
      "aria-current",
      "page"
    );
  });

  it("marks More active on a drawer-only route", () => {
    render(<MobileTabBar pathname="/site-measures" onMore={() => {}} />);
    expect(screen.getByRole("button", { name: /More/ })).toHaveAttribute(
      "aria-current",
      "page"
    );
  });

  it("calls onMore when More is tapped", () => {
    const onMore = vi.fn();
    render(<MobileTabBar pathname="/" onMore={onMore} />);
    fireEvent.click(screen.getByRole("button", { name: /More/ }));
    expect(onMore).toHaveBeenCalledTimes(1);
  });
});

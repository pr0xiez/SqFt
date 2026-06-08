// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useSidebarCollapsed } from "@/lib/hooks/useSidebarCollapsed";

beforeEach(() => localStorage.clear());

describe("useSidebarCollapsed", () => {
  it("defaults to expanded (not collapsed)", () => {
    const { result } = renderHook(() => useSidebarCollapsed());
    expect(result.current.collapsed).toBe(false);
  });

  it("reads a previously persisted collapsed state on mount", () => {
    localStorage.setItem("sqft.sidebar.collapsed", "1");
    const { result } = renderHook(() => useSidebarCollapsed());
    expect(result.current.collapsed).toBe(true);
  });

  it("toggle flips and persists the state", () => {
    const { result } = renderHook(() => useSidebarCollapsed());
    act(() => result.current.toggle());
    expect(result.current.collapsed).toBe(true);
    expect(localStorage.getItem("sqft.sidebar.collapsed")).toBe("1");
    act(() => result.current.toggle());
    expect(result.current.collapsed).toBe(false);
    expect(localStorage.getItem("sqft.sidebar.collapsed")).toBe("0");
  });
});

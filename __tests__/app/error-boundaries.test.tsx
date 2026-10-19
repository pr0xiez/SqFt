// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminError from "@/app/(admin)/error";
import AppError from "@/app/(app)/error";
import RootError from "@/app/error";
import GlobalError from "@/app/global-error";

const error = Object.assign(new Error("boom"), { digest: "abc123" });

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe.each([
  ["root", RootError],
  ["(app)", AppError],
  ["(admin)", AdminError],
])("%s error boundary", (_name, Boundary) => {
  it("shows recovery UI, logs, and retries", () => {
    const retry = vi.fn();
    render(<Boundary error={error} unstable_retry={retry} />);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("Reference: abc123")).toBeTruthy();
    expect(screen.queryByText("boom")).toBeNull();
    expect(console.error).toHaveBeenCalledWith(error);
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link").getAttribute("href")).toBe("/");
  });
});

describe("global-error", () => {
  it("renders a retry button", () => {
    const retry = vi.fn();
    render(<GlobalError error={error} unstable_retry={retry} />);
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});

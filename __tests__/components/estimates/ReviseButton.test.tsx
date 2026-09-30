// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReviseButton } from "@/components/estimates/ReviseButton";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("ReviseButton", () => {
  it("stays disabled after a successful revision while navigation is pending", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 123 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetch);
    const client = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <ReviseButton estimateId={42} />
      </QueryClientProvider>
    );
    const button = screen.getByRole("button", { name: "Revise" });
    fireEvent.click(button);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/estimates/123"));
    await waitFor(() => expect(button).toBeDisabled());
    fireEvent.click(button);
    expect(fetch).toHaveBeenCalledTimes(1);
    client.clear();
  });
});

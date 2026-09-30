// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceSettingsInitial } from "@/components/settings/workspace/types";
import { WorkspaceSettingsView } from "@/components/settings/workspace/WorkspaceSettingsView";

const showToast = vi.fn();
vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ showToast }),
}));

// jsdom has no IntersectionObserver; Toc's scroll-spy needs one to construct.
class FakeIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function initial(
  over: Partial<WorkspaceSettingsInitial> = {}
): WorkspaceSettingsInitial {
  return {
    id: "org1",
    name: "Pinecrest Flooring",
    licenseNumber: "LIC-123",
    timezone: "America/New_York",
    locale: "en-US",
    brandColor: "#c0341a",
    tagline: "Quality flooring since 1998",
    showLicenseOnEstimates: true,
    defaultDepositPct: 0.3,
    defaultValidityDays: 21,
    defaultUnitLabel: "ft²",
    defaultTerms: "Net 30",
    ...over,
  };
}

function renderView(init: WorkspaceSettingsInitial = initial()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <WorkspaceSettingsView initial={init} />
    </QueryClientProvider>
  );
}

/** The save bar is always mounted (role="status") — its dirty/clean state
 * lives in its className, not in whether it exists. */
function saveBar() {
  return screen.getByRole("status");
}

function isArmed(bar: HTMLElement) {
  return bar.className.includes("pointer-events-auto");
}

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  showToast.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("WorkspaceSettingsView — dirty state", () => {
  it("starts clean: the save bar is present but inert", () => {
    renderView();
    expect(isArmed(saveBar())).toBe(false);
    expect(
      screen.getByRole("button", { name: "Save workspace" })
    ).toBeInTheDocument();
  });

  it("arms the save bar after an edit, and reset reverts the edit and disarms it", () => {
    renderView();
    const nameInput = screen.getByDisplayValue(
      "Pinecrest Flooring"
    ) as HTMLInputElement;

    fireEvent.change(nameInput, { target: { value: "New Name Co" } });
    expect(isArmed(saveBar())).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Revert" }));
    expect(nameInput.value).toBe("Pinecrest Flooring");
    expect(isArmed(saveBar())).toBe(false);
  });
});

describe("WorkspaceSettingsView — save", () => {
  it("calls PATCH /api/org with only the edited fields, then goes clean again", async () => {
    const fetchMock = vi.fn(async (_url: string, _opts?: RequestInit) => ({
      ok: true,
      json: async () => ({
        ...initial(),
        name: "New Name Co",
        defaultValidityDays: 30,
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    renderView();

    fireEvent.change(screen.getByDisplayValue("Pinecrest Flooring"), {
      target: { value: "New Name Co" },
    });
    fireEvent.change(screen.getByDisplayValue("21"), {
      target: { value: "30" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save workspace" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, opts] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("/api/org");
    expect(opts).toMatchObject({ method: "PATCH" });
    expect(JSON.parse((opts?.body ?? "") as string)).toEqual({
      name: "New Name Co",
      defaultValidityDays: 30,
    });

    // Snapshot advances to the saved response → dirty clears.
    await waitFor(() => expect(isArmed(saveBar())).toBe(false));
  });

  it("surfaces an error and keeps the form dirty when the save fails", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({
        error: { code: "INTERNAL", message: "Something broke" },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    renderView();

    const nameInput = screen.getByDisplayValue(
      "Pinecrest Flooring"
    ) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "New Name Co" } });
    fireEvent.click(screen.getByRole("button", { name: "Save workspace" }));

    await waitFor(() => expect(showToast).toHaveBeenCalled());
    expect(showToast.mock.calls[0][0]).toMatch(/something broke/i);

    // The edit was never committed to a new snapshot, so it's still there
    // and the save bar is still armed — nothing was silently discarded.
    expect(nameInput.value).toBe("New Name Co");
    expect(isArmed(saveBar())).toBe(true);
  });

  it("sends nothing and never disarms when Save is clicked with no edits", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderView();

    fireEvent.click(screen.getByRole("button", { name: "Save workspace" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(isArmed(saveBar())).toBe(false);
  });
});

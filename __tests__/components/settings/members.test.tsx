// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AddMemberForm } from "@/components/settings/members/AddMemberForm";
import { MemberRow } from "@/components/settings/members/MemberRow";
import { MembersView } from "@/components/settings/members/MembersView";
import type { MemberRow as Row } from "@/components/settings/members/types";

const fetchMock = vi.fn();

function row(over: Partial<Row> = {}): Row {
  return {
    id: "u2",
    name: "Pat Crew",
    email: "pat@org.test",
    role: "crew",
    title: null,
    archived: false,
    createdAt: "2026-06-30T00:00:00.000Z",
    ...over,
  };
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function openForm() {
  fireEvent.click(screen.getByRole("button", { name: /invite member/i }));
}

function fill(name: string, email: string, password: string) {
  fireEvent.change(screen.getByLabelText(/^name/i), {
    target: { value: name },
  });
  fireEvent.change(screen.getByLabelText(/^email/i), {
    target: { value: email },
  });
  fireEvent.change(screen.getByLabelText(/temporary password/i), {
    target: { value: password },
  });
}

describe("AddMemberForm", () => {
  it("blocks submit for an invalid email", () => {
    wrap(<AddMemberForm onCreated={vi.fn()} />);
    openForm();
    fill("New Hire", "not-an-email", "longenough1");
    fireEvent.click(screen.getByRole("button", { name: /add member/i }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/^email/i)).toBeInvalid();
  });

  it("blocks submit for a too-short temporary password", () => {
    wrap(<AddMemberForm onCreated={vi.fn()} />);
    openForm();
    fill("New Hire", "new@org.test", "short");
    fireEvent.click(screen.getByRole("button", { name: /add member/i }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/temporary password/i)).toHaveAttribute(
      "minlength",
      "8"
    );
  });

  it("surfaces the server's duplicate-email error and stays open", async () => {
    fetchMock.mockResolvedValue(
      json(409, {
        error: { code: "EMAIL_TAKEN", message: "That email is already in use" },
      })
    );
    const onCreated = vi.fn();
    wrap(<AddMemberForm onCreated={onCreated} />);
    openForm();
    fill("Dup", "pat@org.test", "longenough1");
    fireEvent.click(screen.getByRole("button", { name: /add member/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That email is already in use"
    );
    expect(onCreated).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/^name/i)).toHaveValue("Dup");
  });

  it("posts valid input, reports the created row and collapses", async () => {
    const created = row({ id: "u9", name: "New Hire", email: "new@org.test" });
    fetchMock.mockResolvedValue(json(201, created));
    const onCreated = vi.fn();
    wrap(<AddMemberForm onCreated={onCreated} />);
    openForm();
    fill("New Hire", "new@org.test", "longenough1");
    fireEvent.click(screen.getByRole("button", { name: /add member/i }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/users");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      name: "New Hire",
      email: "new@org.test",
      role: "crew",
      password: "longenough1",
    });
    expect(
      await screen.findByRole("button", { name: /invite member/i })
    ).toBeInTheDocument();
  });
});

describe("MemberRow", () => {
  it("archives via PATCH and reports the updated row", async () => {
    const r = row();
    fetchMock.mockResolvedValue(json(200, { ...r, archived: true }));
    const onUpdated = vi.fn();
    wrap(<MemberRow row={r} isSelf={false} onUpdated={onUpdated} />);
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));

    await waitFor(() =>
      expect(onUpdated).toHaveBeenCalledWith({ ...r, archived: true })
    );
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/users/u2");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ archived: true });
  });

  it("restores an archived member with archived:false and locks the role", async () => {
    const r = row({ archived: true });
    fetchMock.mockResolvedValue(json(200, { ...r, archived: false }));
    const onUpdated = vi.fn();
    wrap(<MemberRow row={r} isSelf={false} onUpdated={onUpdated} />);
    expect(screen.getByLabelText(/role for pat crew/i)).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));

    await waitFor(() => expect(onUpdated).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      archived: false,
    });
  });

  it("shows the server error when archiving is rejected", async () => {
    fetchMock.mockResolvedValue(
      json(403, { error: { code: "FORBIDDEN", message: "Admins only" } })
    );
    const onUpdated = vi.fn();
    wrap(<MemberRow row={row()} isSelf={false} onUpdated={onUpdated} />);
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Admins only");
    expect(onUpdated).not.toHaveBeenCalled();
  });

  it("offers no archive action and a disabled role for the current user", () => {
    wrap(<MemberRow row={row()} isSelf onUpdated={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Archive" })).toBeNull();
    expect(screen.getByLabelText(/role for pat crew/i)).toBeDisabled();
  });
});

describe("MembersView archive/restore", () => {
  it("moves a member between the active and archived lists", async () => {
    const r = row();
    fetchMock
      .mockResolvedValueOnce(json(200, { ...r, archived: true }))
      .mockResolvedValueOnce(json(200, { ...r, archived: false }));
    wrap(
      <MembersView
        initial={[row({ id: "me", name: "Admin" }), r]}
        currentUserId="me"
      />
    );

    expect(screen.queryByText(/^Archived/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    expect(await screen.findByText(/^Archived/)).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Restore" }));
    await waitFor(() => expect(screen.queryByText(/^Archived/)).toBeNull());
    expect(screen.getByRole("button", { name: "Archive" })).toBeInTheDocument();
  });
});

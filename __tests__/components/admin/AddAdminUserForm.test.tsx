// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MemberRow } from "@/components/settings/members/types";

const mutate = vi.fn();
vi.mock("@/lib/hooks/useAdminOrgMembers", () => ({
  useCreateAdminOrgMember: () => ({ mutate, isPending: false }),
}));

import { AddAdminUserForm } from "@/components/admin/orgs/detail/AddAdminUserForm";

const ROW: MemberRow = {
  id: "m9",
  name: "New Hire",
  email: "new@org.test",
  role: "crew",
  title: null,
  archived: false,
  createdAt: "2026-06-30T00:00:00.000Z",
};

beforeEach(() => {
  mutate.mockReset();
});

describe("AddAdminUserForm", () => {
  it("submits the typed values and reveals the temp password on success", () => {
    mutate.mockImplementation(
      (_input, opts: { onSuccess: (r: MemberRow) => void }) =>
        opts.onSuccess(ROW)
    );
    const onCreated = vi.fn();
    render(<AddAdminUserForm orgId="org1" onCreated={onCreated} />);

    fireEvent.click(screen.getByRole("button", { name: /add user/i }));
    fireEvent.change(screen.getByLabelText(/name/i), {
      target: { value: "New Hire" },
    });
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "new@org.test" },
    });
    fireEvent.change(screen.getByLabelText(/temporary password/i), {
      target: { value: "temp-pass-123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^add user$/i }));

    expect(mutate).toHaveBeenCalledWith(
      {
        name: "New Hire",
        email: "new@org.test",
        role: "crew",
        password: "temp-pass-123",
      },
      expect.anything()
    );
    expect(onCreated).toHaveBeenCalledWith(ROW);
    // Credential reveal shows the email + the temp password.
    expect(screen.getByText("new@org.test")).toBeInTheDocument();
    expect(screen.getByText("temp-pass-123")).toBeInTheDocument();
  });
});

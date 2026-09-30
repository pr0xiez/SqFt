// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { Modal } from "@/components/ui/Modal";
import { SlidePanel } from "@/components/ui/SlidePanel";

describe("Modal", () => {
  it("moves focus into the panel on open and restores it to the trigger on close", () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open
          </button>
          <Modal
            open={open}
            onClose={() => setOpen(false)}
            title="Void invoice"
          >
            <button type="button">Confirm</button>
          </Modal>
        </>
      );
    }
    render(<Harness />);

    const trigger = screen.getByRole("button", { name: "Open" });
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Confirm" })
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.activeElement).toBe(trigger);
  });

  it("traps Tab focus within the panel's focusable elements", () => {
    render(
      <Modal open onClose={() => {}} title="Record payment">
        <button type="button">First</button>
        <button type="button">Last</button>
      </Modal>
    );

    const first = screen.getByRole("button", { name: "First" });
    const last = screen.getByRole("button", { name: "Last" });
    const panel = screen.getByRole("dialog");

    expect(document.activeElement).toBe(first);

    last.focus();
    fireEvent.keyDown(panel, { key: "Tab" });
    expect(document.activeElement).toBe(first);

    fireEvent.keyDown(panel, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("unmounts entirely when closed", () => {
    render(
      <Modal open={false} onClose={() => {}} title="Hidden">
        <button type="button">Ignored</button>
      </Modal>
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("Modal + SlidePanel nested scroll lock", () => {
  it("keeps the body scroll locked while the outer dialog is still open, even after the inner one closes", () => {
    function Harness() {
      const [panelOpen, setPanelOpen] = useState(true);
      const [modalOpen, setModalOpen] = useState(true);
      return (
        <SlidePanel
          open={panelOpen}
          onClose={() => setPanelOpen(false)}
          title="Panel"
        >
          <Modal
            open={modalOpen}
            onClose={() => setModalOpen(false)}
            title="Nested"
          >
            <button type="button" onClick={() => setModalOpen(false)}>
              Close nested
            </button>
          </Modal>
        </SlidePanel>
      );
    }
    const { rerender } = render(<Harness />);

    // Both the SlidePanel and the nested Modal are open: locked.
    expect(document.body.style.overflow).toBe("hidden");

    // Close only the inner Modal — the outer SlidePanel is still open, so
    // the body must stay locked (this is the nest-safety bug from #228).
    fireEvent.click(screen.getByRole("button", { name: "Close nested" }));
    expect(document.body.style.overflow).toBe("hidden");

    rerender(<Harness />);
    expect(document.body.style.overflow).toBe("hidden");
  });
});

describe("SlidePanel", () => {
  it("stays mounted while closed but is stripped of dialog semantics and inert", () => {
    const { rerender } = render(
      <SlidePanel open={false} onClose={() => {}} title="Closed panel">
        <button type="button">Inside</button>
      </SlidePanel>
    );

    const panel = screen.getByLabelText("Closed panel", { selector: "div" });
    expect(panel).toHaveAttribute("aria-hidden", "true");
    expect(panel).not.toHaveAttribute("aria-modal");
    expect(panel).toHaveAttribute("inert");

    rerender(
      <SlidePanel open onClose={() => {}} title="Closed panel">
        <button type="button">Inside</button>
      </SlidePanel>
    );
    expect(panel).not.toHaveAttribute("aria-hidden");
    expect(panel).toHaveAttribute("aria-modal", "true");
    expect(panel).not.toHaveAttribute("inert");
  });

  it("locks and releases the shared body scroll lock on its own", () => {
    const { unmount } = render(
      <SlidePanel open onClose={() => {}} title="Solo panel">
        <button type="button">Inside</button>
      </SlidePanel>
    );
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("");
  });
});

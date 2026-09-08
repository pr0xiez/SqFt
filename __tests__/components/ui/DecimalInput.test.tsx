// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { DecimalInput } from "@/components/ui/DecimalInput";
import { round2 } from "@/lib/money";

function getInput() {
  return screen.getByRole("textbox") as HTMLInputElement;
}

describe("DecimalInput", () => {
  describe("input masking", () => {
    it("accepts a bare integer", () => {
      const onCommit = vi.fn();
      render(<DecimalInput value={0} onCommit={onCommit} />);
      const input = getInput();
      fireEvent.change(input, { target: { value: "42" } });
      expect(input.value).toBe("42");
    });

    it("accepts a decimal point with up to maxDecimals digits", () => {
      const onCommit = vi.fn();
      render(<DecimalInput value={0} onCommit={onCommit} maxDecimals={2} />);
      const input = getInput();
      fireEvent.change(input, { target: { value: "12.3" } });
      expect(input.value).toBe("12.3");
      fireEvent.change(input, { target: { value: "12.34" } });
      expect(input.value).toBe("12.34");
    });

    it("accepts a lone trailing decimal point (mid-typing state)", () => {
      const onCommit = vi.fn();
      render(<DecimalInput value={0} onCommit={onCommit} />);
      const input = getInput();
      fireEvent.change(input, { target: { value: "5." } });
      expect(input.value).toBe("5.");
    });

    it("rejects more fractional digits than maxDecimals allows", () => {
      const onCommit = vi.fn();
      render(<DecimalInput value={0} onCommit={onCommit} maxDecimals={2} />);
      const input = getInput();
      // Establish a valid draft first...
      fireEvent.change(input, { target: { value: "12.34" } });
      expect(input.value).toBe("12.34");
      // ...then a keystroke that would exceed maxDecimals is rejected, so the
      // draft (and displayed value) stays unchanged.
      fireEvent.change(input, { target: { value: "12.345" } });
      expect(input.value).toBe("12.34");
    });

    it("rejects a second decimal point", () => {
      const onCommit = vi.fn();
      render(<DecimalInput value={0} onCommit={onCommit} />);
      const input = getInput();
      fireEvent.change(input, { target: { value: "1.2" } });
      fireEvent.change(input, { target: { value: "1.2.3" } });
      expect(input.value).toBe("1.2");
    });

    it("rejects non-numeric characters", () => {
      const onCommit = vi.fn();
      render(<DecimalInput value={null} onCommit={onCommit} allowEmpty />);
      const input = getInput();
      fireEvent.change(input, { target: { value: "12a" } });
      expect(input.value).toBe("");
    });

    it("respects a custom maxDecimals (e.g. 0 for whole numbers)", () => {
      const onCommit = vi.fn();
      render(<DecimalInput value={0} onCommit={onCommit} maxDecimals={0} />);
      const input = getInput();
      fireEvent.change(input, { target: { value: "7" } });
      expect(input.value).toBe("7");
      fireEvent.change(input, { target: { value: "7.5" } });
      // rejected — no decimal point allowed at all when maxDecimals is 0
      expect(input.value).toBe("7");
    });

    it("allows an empty string as an in-progress edit", () => {
      const onCommit = vi.fn();
      render(<DecimalInput value={5} onCommit={onCommit} />);
      const input = getInput();
      fireEvent.change(input, { target: { value: "" } });
      expect(input.value).toBe("");
    });
  });

  describe("the .005-boundary rounding bug (matches lib/money.ts round2)", () => {
    // The input mask caps typed drafts at `maxDecimals` fractional digits, so a
    // user can never *type* a 3rd decimal into a maxDecimals=2 field. The
    // real-world trigger is a `value` prop carrying float drift beyond 2dp
    // (e.g. 1.005 from an upstream computation) — on focus (without
    // formatOnBlur), the draft is seeded with the *unmasked* `String(value)`,
    // so tabbing/clicking through without editing still runs it through the
    // commit-time rounding. This is exactly the divergence bug #250 reports:
    // the old `Math.round(n * 100) / 100` disagreed with `round2` at this
    // boundary because of binary-float error in `n * 100`.
    it("commits 1.005 the same way round2 would (1.01, not 1)", () => {
      const onCommit = vi.fn();
      render(<DecimalInput value={1.005} onCommit={onCommit} />);
      const input = getInput();
      fireEvent.focus(input);
      expect(input.value).toBe("1.005");
      fireEvent.blur(input);
      expect(onCommit).toHaveBeenCalledWith(round2(1.005));
      expect(onCommit).toHaveBeenCalledWith(1.01);
    });

    it("commits 1.015 the same way round2 would (1.02, not 1.01)", () => {
      const onCommit = vi.fn();
      render(<DecimalInput value={1.015} onCommit={onCommit} />);
      const input = getInput();
      fireEvent.focus(input);
      fireEvent.blur(input);
      expect(onCommit).toHaveBeenCalledWith(round2(1.015));
      expect(onCommit).toHaveBeenCalledWith(1.02);
    });

    it("leaves already-2dp values untouched", () => {
      const onCommit = vi.fn();
      render(<DecimalInput value={0} onCommit={onCommit} />);
      const input = getInput();
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: "35.85" } });
      fireEvent.blur(input);
      expect(onCommit).toHaveBeenCalledWith(round2(35.85));
      expect(onCommit).toHaveBeenCalledWith(35.85);
    });
  });

  describe("empty / NaN commit semantics", () => {
    it("commits null when allowEmpty and the field is cleared", () => {
      const onCommit = vi.fn();
      render(<DecimalInput value={5} onCommit={onCommit} allowEmpty />);
      const input = getInput();
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: "" } });
      fireEvent.blur(input);
      expect(onCommit).toHaveBeenCalledWith(null);
    });

    it("commits 0 when NOT allowEmpty and the field is cleared", () => {
      const onCommit = vi.fn();
      render(<DecimalInput value={5} onCommit={onCommit} />);
      const input = getInput();
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: "" } });
      fireEvent.blur(input);
      expect(onCommit).toHaveBeenCalledWith(0);
    });

    it("commits null for a lone '.' when allowEmpty", () => {
      const onCommit = vi.fn();
      render(<DecimalInput value={5} onCommit={onCommit} allowEmpty />);
      const input = getInput();
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: "." } });
      fireEvent.blur(input);
      expect(onCommit).toHaveBeenCalledWith(null);
    });

    it("with formatOnBlur, does not fire onCommit when blurred without any edit", () => {
      // Under formatOnBlur, onFocus deliberately leaves draft null (see the
      // component's onFocus comment) so blurring untouched never re-commits —
      // and, in particular, never runs the untouched value back through
      // commit-time rounding.
      const onCommit = vi.fn();
      render(<DecimalInput value={5} onCommit={onCommit} formatOnBlur />);
      const input = getInput();
      fireEvent.focus(input);
      fireEvent.blur(input);
      expect(onCommit).not.toHaveBeenCalled();
    });

    it("without formatOnBlur, blurring untouched re-commits the seeded draft (rounded)", () => {
      // Without formatOnBlur, onFocus seeds the draft with String(value), so an
      // untouched blur still runs that draft through commit-time rounding.
      const onCommit = vi.fn();
      render(<DecimalInput value={5} onCommit={onCommit} />);
      const input = getInput();
      fireEvent.focus(input);
      fireEvent.blur(input);
      expect(onCommit).toHaveBeenCalledWith(5);
    });
  });

  describe("focus / draft / blur state machine", () => {
    it("without formatOnBlur, shows the raw String(value) on focus", () => {
      render(<DecimalInput value={5} onCommit={vi.fn()} />);
      const input = getInput();
      expect(input.value).toBe("5");
      fireEvent.focus(input);
      expect(input.value).toBe("5");
    });

    it("with formatOnBlur, the unfocused display is toFixed(maxDecimals)", () => {
      render(<DecimalInput value={5} onCommit={vi.fn()} formatOnBlur />);
      const input = getInput();
      expect(input.value).toBe("5.00");
    });

    it("with formatOnBlur, focusing does NOT reformat into the raw value — it stays the fixed display until the user types", () => {
      render(<DecimalInput value={5} onCommit={vi.fn()} formatOnBlur />);
      const input = getInput();
      expect(input.value).toBe("5.00");
      fireEvent.focus(input);
      // draft stays null on focus under formatOnBlur, so the fixed display persists
      expect(input.value).toBe("5.00");
    });

    it("with formatOnBlur, after the user types, the draft (not the formatted value) is shown", () => {
      render(<DecimalInput value={5} onCommit={vi.fn()} formatOnBlur />);
      const input = getInput();
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: "5.5" } });
      expect(input.value).toBe("5.5");
    });

    it("after blur, the draft clears and the display reflects the newly committed value via props", () => {
      function Wrapper() {
        const [value, setValue] = useState(5);
        return (
          <DecimalInput
            value={value}
            onCommit={(n: number | null) => setValue(n ?? 0)}
            formatOnBlur
          />
        );
      }
      render(<Wrapper />);
      const input = getInput();
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: "6.5" } });
      fireEvent.blur(input);
      expect(input.value).toBe("6.50");
    });
  });
});

"use client";

import { useState } from "react";

type BaseProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type" | "inputMode"
>;

interface Props extends BaseProps {
  value: number | null | undefined;
  onCommit: (next: number | null) => void;
  /** Maximum decimal places allowed during input (default 2). */
  maxDecimals?: number;
  /** If true, an empty field commits as null. If false, empty becomes 0. */
  allowEmpty?: boolean;
  /** When unfocused, render the value with maxDecimals fixed decimals. */
  formatOnBlur?: boolean;
}

export function DecimalInput({
  value,
  onCommit,
  maxDecimals = 2,
  allowEmpty = false,
  formatOnBlur = false,
  onFocus,
  onBlur,
  ...rest
}: Props) {
  const [draft, setDraft] = useState<string | null>(null);

  const formattedValue =
    value === null || value === undefined
      ? ""
      : formatOnBlur
        ? value.toFixed(maxDecimals)
        : String(value);

  const display = draft ?? formattedValue;

  const allowedPattern = new RegExp(`^\\d*(?:\\.\\d{0,${maxDecimals}})?$`);

  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      value={display}
      onChange={(e) => {
        const v = e.target.value;
        if (v === "" || allowedPattern.test(v)) {
          setDraft(v);
        }
      }}
      onFocus={(e) => {
        // With formatOnBlur, leave draft null so the formatted toFixed(maxDecimals)
        // value remains visible — prevents float artifacts (e.g. 99.99000000000001)
        // or hidden sub-cent precision from leaking on focus. Typing still sets
        // draft via onChange; if the user blurs without editing, draft stays null
        // and no commit fires, preserving the underlying value.
        if (!formatOnBlur) {
          setDraft(value === null || value === undefined ? "" : String(value));
        }
        onFocus?.(e);
      }}
      onBlur={(e) => {
        const d = draft;
        setDraft(null);
        if (d !== null) {
          if (d === "" || d === ".") {
            onCommit(allowEmpty ? null : 0);
          } else {
            const n = Number(d);
            if (Number.isNaN(n)) {
              onCommit(allowEmpty ? null : 0);
            } else {
              const factor = 10 ** maxDecimals;
              onCommit(Math.round(n * factor) / factor);
            }
          }
        }
        onBlur?.(e);
      }}
    />
  );
}

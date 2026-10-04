"use client";

import { useEffect, useState } from "react";
import { DesktopIcon, MoonIcon, SunIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

type ThemeChoice = "system" | "light" | "dark";

const OPTIONS: ReadonlyArray<{
  value: ThemeChoice;
  label: string;
  Icon: typeof SunIcon;
}> = [
  { value: "system", label: "Match system theme", Icon: DesktopIcon },
  { value: "light", label: "Light theme", Icon: SunIcon },
  { value: "dark", label: "Dark theme", Icon: MoonIcon },
];

function readChoice(): ThemeChoice {
  try {
    const saved = localStorage.getItem("theme");
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    return "system";
  }
}

function applyChoice(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "system") {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = choice;
  }
  try {
    if (choice === "system") localStorage.removeItem("theme");
    else localStorage.setItem("theme", choice);
  } catch {
    // Storage blocked (private mode): the choice still applies to this page.
  }
}

/**
 * System / light / dark. "System" follows the OS (the CSS handles it, so it
 * also tracks the OS flipping at sunset); an explicit pick is remembered.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const [choice, setChoice] = useState<ThemeChoice>("system");

  useEffect(() => {
    setChoice(readChoice());
  }, []);

  function choose(next: ThemeChoice) {
    setChoice(next);
    applyChoice(next);
  }

  return (
    <fieldset
      className={cn("seg p-[2px] [&>*]:min-h-[28px] [&>*]:px-2", className)}
      aria-label="Theme"
    >
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          onClick={() => choose(value)}
          aria-label={label}
          aria-pressed={choice === value}
          title={label}
        >
          <Icon aria-hidden="true" className="size-[15px]" />
        </button>
      ))}
    </fieldset>
  );
}

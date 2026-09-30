"use client";

import { type RefObject, useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
  );
}

/**
 * Self-contained focus-trap hook for the shared dialog shells (`Modal`,
 * `SlidePanel`). While `active` is true:
 *  - stores the element that had focus before open, to restore on close
 *  - moves focus into `containerRef` (first focusable descendant, or the
 *    container itself when nothing inside is focusable)
 *  - traps Tab / Shift+Tab cycling within the container's focusable elements
 *
 * On close (`active` flips to false, or the component unmounts while still
 * active), focus is restored to the element that triggered the dialog.
 */
export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  active: boolean
) {
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    restoreRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const initial = getFocusable(container)[0] ?? container;
    initial.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = getFocusable(container);
      if (items.length === 0) {
        e.preventDefault();
        container.focus();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      const activeEl = document.activeElement;
      const withinContainer =
        activeEl instanceof Node && container.contains(activeEl);

      if (e.shiftKey) {
        if (!withinContainer || activeEl === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (!withinContainer || activeEl === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    container.addEventListener("keydown", onKeyDown);

    return () => {
      container.removeEventListener("keydown", onKeyDown);
      restoreRef.current?.focus();
      restoreRef.current = null;
    };
  }, [active, containerRef]);
}

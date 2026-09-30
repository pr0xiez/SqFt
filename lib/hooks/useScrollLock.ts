"use client";

import { useEffect } from "react";

// Module-level, shared by every consumer of this hook (Modal, SlidePanel,
// and anything nested inside either). Ref-counted so an inner dialog closing
// never unlocks scroll for a still-open outer one.
let lockCount = 0;

function lock() {
  lockCount += 1;
  if (lockCount === 1) {
    document.body.style.overflow = "hidden";
  }
}

function unlock() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) {
    document.body.style.overflow = "";
  }
}

/**
 * Nest-safe body scroll lock: locks `document.body.style.overflow` while
 * `active` is true, using a module-level ref count so multiple nested
 * dialogs (e.g. a Modal opened from within an open SlidePanel) don't clobber
 * each other's lock/unlock on close.
 */
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    lock();
    return () => {
      unlock();
    };
  }, [active]);
}

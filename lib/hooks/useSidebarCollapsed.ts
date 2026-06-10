"use client";

import { useEffect, useState } from "react";

const BASE_KEY = "sqft.sidebar.collapsed";

function storageKey(scope?: string) {
  return scope ? `${BASE_KEY}:${scope}` : BASE_KEY;
}

export function useSidebarCollapsed(scope?: string) {
  // Default expanded so SSR and first client render agree (no flash).
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem(storageKey(scope)) === "1");
  }, [scope]);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(storageKey(scope), next ? "1" : "0");
      return next;
    });
  }

  return { collapsed, toggle };
}

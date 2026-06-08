"use client";

import { useEffect, useState } from "react";

const KEY = "sqft.sidebar.collapsed";

export function useSidebarCollapsed() {
  // Default expanded so SSR and first client render agree (no flash).
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem(KEY) === "1");
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(KEY, next ? "1" : "0");
      return next;
    });
  }

  return { collapsed, toggle };
}

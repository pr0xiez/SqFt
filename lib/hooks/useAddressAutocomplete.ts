"use client";

import { useEffect, useRef, useState } from "react";
import type { AddressSuggestion } from "@/lib/address/geoapify";

/**
 * Debounced, cancelable address-suggestion search behind
 * `GET /api/address/autocomplete`, for the structured location address form
 * (`LocationsCard`). This is a search-as-you-type helper, not a cached
 * resource — the proxy route already degrades to `[]` on any failure (missing
 * key / network error / timeout), so callers just get "no suggestions" rather
 * than a surfaced error.
 */
export function useAddressAutocomplete() {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Cancel any scheduled-but-not-fired debounce and abort the in-flight
  // fetch, so a stale response can't clobber newer suggestions and a pending
  // timer can't re-open the dropdown after the caller has moved on.
  function cancelPending() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    abortRef.current?.abort();
  }

  function clear() {
    cancelPending();
    setSuggestions([]);
    setShowSuggestions(false);
  }

  // Debounced autocomplete keyed off the given street value.
  function query(value: string) {
    cancelPending();
    if (value.trim().length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch(
          `/api/address/autocomplete?q=${encodeURIComponent(value)}`,
          { signal: controller.signal }
        );
        if (!res.ok) return;
        const data = (await res.json()) as AddressSuggestion[];
        setSuggestions(data);
        setShowSuggestions(data.length > 0);
      } catch {
        // graceful (incl. AbortError): keep manual entry
      }
    }, 250);
  }

  function openSuggestions() {
    setShowSuggestions(suggestions.length > 0);
  }

  function closeSuggestions() {
    setShowSuggestions(false);
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, []);

  return {
    suggestions,
    showSuggestions,
    query,
    cancelPending,
    clear,
    openSuggestions,
    closeSuggestions,
  };
}

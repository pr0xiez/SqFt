"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { AddressSuggestion } from "@/lib/address/geoapify";
import type { CustomerLocationSummary } from "@/lib/hooks/useCustomers";

export interface NewLocationInput {
  street: string;
  unit: string;
  city: string;
  state: string;
  postalCode: string;
  label: string;
  lat?: number;
  lon?: number;
}

interface Props {
  locations: CustomerLocationSummary[];
  adding: boolean;
  onAddingChange: (value: boolean) => void;
  onAddLocation: (input: NewLocationInput) => Promise<void>;
  onStartSiteMeasure: (locationId: number) => void;
  isAdding: boolean; // createLocation.isPending
  isStarting: boolean; // createSiteMeasure.isPending
}

const EMPTY: NewLocationInput = {
  street: "",
  unit: "",
  city: "",
  state: "",
  postalCode: "",
  label: "",
};

const fieldLabel =
  "font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.06em] mb-[5px]";
const fieldInput =
  "w-full text-[13px] border border-[var(--line)] bg-[var(--surface)] px-2.5 py-2 rounded-[5px] focus:outline-none focus:border-[var(--ink-2)] transition-[border-color] duration-150";

function mapsHref(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export function LocationsCard({
  locations,
  adding,
  onAddingChange,
  onAddLocation,
  onStartSiteMeasure,
  isAdding,
  isStarting,
}: Props) {
  const [form, setForm] = useState<NewLocationInput>(EMPTY);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function reset() {
    setForm(EMPTY);
    setSuggestions([]);
    setShowSuggestions(false);
  }

  // Debounced autocomplete keyed off the street field. The proxy returns [] on
  // any failure, so a missing key / network error just yields no dropdown.
  function onStreetChange(value: string) {
    setForm((f) => ({ ...f, street: value }));
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/address/autocomplete?q=${encodeURIComponent(value)}`
        );
        if (!res.ok) return;
        const data = (await res.json()) as AddressSuggestion[];
        setSuggestions(data);
        setShowSuggestions(data.length > 0);
      } catch {
        // graceful: keep manual entry
      }
    }, 250);
  }

  function pickSuggestion(s: AddressSuggestion) {
    setForm((f) => ({
      ...f,
      street: s.street,
      city: s.city,
      state: s.state,
      postalCode: s.postalCode,
      lat: s.lat ?? undefined,
      lon: s.lon ?? undefined,
    }));
    setShowSuggestions(false);
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  async function handleSave() {
    try {
      await onAddLocation({
        ...form,
        street: form.street.trim(),
        unit: form.unit.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        postalCode: form.postalCode.trim(),
        label: form.label.trim(),
      });
      reset();
      onAddingChange(false);
    } catch {
      // Orchestrator surfaces the toast; keep inputs for a retry.
    }
  }

  const canSave = Boolean(
    form.street.trim() &&
      form.city.trim() &&
      form.state.trim() &&
      form.postalCode.trim()
  );

  return (
    <div
      id="locations-card"
      className="bg-[var(--surface)] border border-[var(--line)] rounded-lg p-5 mb-4"
    >
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-[15px] font-[700] tracking-[-0.015em]">
          Locations
        </h2>
        {!adding && (
          <Button size="sm" onClick={() => onAddingChange(true)}>
            + Add location
          </Button>
        )}
      </div>

      {locations.length === 0 && !adding ? (
        <div className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] py-4">
          No locations yet. Add one to start a site measure.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {locations.map((loc) => (
            <div
              key={loc.id}
              className="flex items-center gap-3 border border-[var(--line)] rounded-md px-4 py-3"
            >
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] font-[600] tracking-[-0.01em]">
                  {loc.address}
                  {loc.label ? (
                    <span className="ml-2 font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.06em] font-[400]">
                      {loc.label}
                    </span>
                  ) : null}
                </div>
                {loc.notes && (
                  <div className="font-[var(--font-mono)] text-[10.5px] text-[var(--muted)] mt-0.5">
                    {loc.notes}
                  </div>
                )}
                <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] mt-0.5">
                  {loc.siteMeasures.length} site measure
                  {loc.siteMeasures.length === 1 ? "" : "s"}
                </div>
              </div>
              {loc.address && (
                <a
                  href={mapsHref(loc.address)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button size="sm">Open in Google Maps</Button>
                </a>
              )}
              <Button
                size="sm"
                variant="primary"
                onClick={() => onStartSiteMeasure(loc.id)}
                disabled={isStarting}
              >
                + Site measure
              </Button>
            </div>
          ))}
        </div>
      )}

      {adding && (
        <div className="mt-3 border border-dashed border-[var(--line-2)] rounded-md p-4 flex flex-col gap-3">
          {/* Street + autocomplete */}
          <div className="relative">
            <div className={fieldLabel}>Street *</div>
            <input
              type="text"
              value={form.street}
              onChange={(e) => onStreetChange(e.target.value)}
              onFocus={() => setShowSuggestions(suggestions.length > 0)}
              placeholder="Start typing an address…"
              autoComplete="off"
              className={fieldInput}
            />
            {showSuggestions && (
              <ul className="absolute z-10 mt-1 w-full bg-[var(--surface)] border border-[var(--line)] rounded-[5px] shadow-md max-h-60 overflow-y-auto">
                {suggestions.map((s) => (
                  <li key={`${s.formatted}|${s.lat},${s.lon}`}>
                    <button
                      type="button"
                      onClick={() => pickSuggestion(s)}
                      className="w-full text-left text-[12.5px] px-2.5 py-2 hover:bg-[var(--surface-2)] cursor-pointer"
                    >
                      {s.formatted}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <div className={fieldLabel}>Unit / Apt</div>
              <input
                type="text"
                value={form.unit}
                onChange={(e) =>
                  setForm((f) => ({ ...f, unit: e.target.value }))
                }
                placeholder="Apt, suite, unit"
                className={fieldInput}
              />
            </div>
            <div>
              <div className={fieldLabel}>City *</div>
              <input
                type="text"
                value={form.city}
                onChange={(e) =>
                  setForm((f) => ({ ...f, city: e.target.value }))
                }
                className={fieldInput}
              />
            </div>
            <div>
              <div className={fieldLabel}>State *</div>
              <input
                type="text"
                value={form.state}
                onChange={(e) =>
                  setForm((f) => ({ ...f, state: e.target.value }))
                }
                placeholder="OH"
                className={fieldInput}
              />
            </div>
            <div>
              <div className={fieldLabel}>ZIP *</div>
              <input
                type="text"
                value={form.postalCode}
                onChange={(e) =>
                  setForm((f) => ({ ...f, postalCode: e.target.value }))
                }
                className={fieldInput}
              />
            </div>
            <div className="md:col-span-2">
              <div className={fieldLabel}>Label</div>
              <input
                type="text"
                value={form.label}
                onChange={(e) =>
                  setForm((f) => ({ ...f, label: e.target.value }))
                }
                placeholder="e.g. Rental, Main house"
                className={fieldInput}
              />
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <Button
              size="sm"
              onClick={() => {
                onAddingChange(false);
                reset();
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={handleSave}
              disabled={isAdding || !canSave}
            >
              {isAdding ? "Saving…" : "Save location"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useId, useState } from "react";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { MapPinIcon, PlusIcon } from "@/components/ui/icons";
import { Tag } from "@/components/ui/StatusBadge";
import type { AddressSuggestion } from "@/lib/address/geoapify";
import { cn } from "@/lib/cn";
import { useAddressAutocomplete } from "@/lib/hooks/useAddressAutocomplete";
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
  const uid = useId();
  const [form, setForm] = useState<NewLocationInput>(EMPTY);
  const {
    suggestions,
    showSuggestions,
    query: queryAddress,
    cancelPending,
    clear: clearSuggestions,
    openSuggestions,
    closeSuggestions,
  } = useAddressAutocomplete();

  function reset() {
    setForm(EMPTY);
    clearSuggestions();
  }

  // Hand-editing a structured field drops any lat/lon captured from a previous
  // pick — coordinates must only persist when they still match the typed
  // address, never after a manual correction.
  function editField(field: "city" | "state" | "postalCode", value: string) {
    setForm((f) => ({ ...f, [field]: value, lat: undefined, lon: undefined }));
  }

  // A hand-edit to the street field also clears any previously-picked
  // coordinates and kicks off a debounced autocomplete search.
  function onStreetChange(value: string) {
    setForm((f) => ({ ...f, street: value, lat: undefined, lon: undefined }));
    queryAddress(value);
  }

  function pickSuggestion(s: AddressSuggestion) {
    cancelPending();
    setForm((f) => ({
      ...f,
      street: s.street,
      city: s.city,
      state: s.state,
      postalCode: s.postalCode,
      lat: s.lat ?? undefined,
      lon: s.lon ?? undefined,
    }));
    closeSuggestions();
  }

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
    <Card
      id="locations-card"
      title="Locations"
      action={
        !adding && (
          <Button size="sm" onClick={() => onAddingChange(true)}>
            + Add location
          </Button>
        )
      }
      className="mb-6"
    >
      {locations.length === 0 && !adding ? (
        <p className="text-[14px] text-[var(--muted)]">
          No locations yet. Add one to start a site measure.
        </p>
      ) : (
        <ul className="-my-3 divide-y divide-[var(--line)]">
          {locations.map((loc) => (
            <li
              key={loc.id}
              className="flex flex-col gap-3 py-3.5 sm:flex-row sm:items-center"
            >
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-[14.5px] font-[600] tracking-[-0.01em]">
                    {loc.address}
                  </span>
                  {loc.label ? <Tag>{loc.label}</Tag> : null}
                </div>
                {loc.notes && (
                  <div className="text-[13px] text-[var(--muted)] mt-0.5">
                    {loc.notes}
                  </div>
                )}
                <div className="text-[13px] text-[var(--muted)] mt-0.5">
                  <span className="type-figure">{loc.siteMeasures.length}</span>{" "}
                  site measure
                  {loc.siteMeasures.length === 1 ? "" : "s"}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                {loc.address && (
                  <a
                    href={mapsHref(loc.address)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={buttonClasses({ size: "sm" })}
                  >
                    <MapPinIcon aria-hidden="true" />
                    Open in Google Maps
                  </a>
                )}
                <Button
                  size="sm"
                  onClick={() => onStartSiteMeasure(loc.id)}
                  disabled={isStarting}
                >
                  <PlusIcon aria-hidden="true" />
                  Site measure
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <div
          className={cn(
            "flex flex-col gap-4",
            locations.length > 0 && "mt-3 pt-5 border-t border-[var(--line)]"
          )}
        >
          {/* Street + autocomplete */}
          <div className="relative">
            <label htmlFor={`${uid}-street`} className="field-label">
              Street *
            </label>
            <input
              id={`${uid}-street`}
              type="text"
              value={form.street}
              onChange={(e) => onStreetChange(e.target.value)}
              onFocus={openSuggestions}
              placeholder="Start typing an address…"
              autoComplete="off"
              className="field"
            />
            {showSuggestions && (
              <ul className="absolute z-[300] mt-1 w-full p-1 bg-[var(--paper)] border border-[var(--line)] rounded-[var(--r)] shadow-[var(--shadow-md)] max-h-60 overflow-y-auto">
                {suggestions.map((s, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: list is replaced wholesale per query and never reordered in place, so the index is a stable collision-free key
                  <li key={`${s.formatted}-${i}`}>
                    <button
                      type="button"
                      onClick={() => pickSuggestion(s)}
                      className="w-full text-left text-[14px] px-2.5 py-2 rounded-[var(--r-in)] hover:bg-[var(--hover)] cursor-pointer"
                    >
                      {s.formatted}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor={`${uid}-unit`} className="field-label">
                Unit / Apt
              </label>
              <input
                id={`${uid}-unit`}
                type="text"
                value={form.unit}
                onChange={(e) =>
                  setForm((f) => ({ ...f, unit: e.target.value }))
                }
                placeholder="Apt, suite, unit"
                className="field"
              />
            </div>
            <div>
              <label htmlFor={`${uid}-city`} className="field-label">
                City *
              </label>
              <input
                id={`${uid}-city`}
                type="text"
                value={form.city}
                onChange={(e) => editField("city", e.target.value)}
                placeholder="Columbus"
                className="field"
              />
            </div>
            <div>
              <label htmlFor={`${uid}-state`} className="field-label">
                State *
              </label>
              <input
                id={`${uid}-state`}
                type="text"
                value={form.state}
                onChange={(e) => editField("state", e.target.value)}
                placeholder="OH"
                className="field"
              />
            </div>
            <div>
              <label htmlFor={`${uid}-zip`} className="field-label">
                ZIP *
              </label>
              <input
                id={`${uid}-zip`}
                type="text"
                value={form.postalCode}
                onChange={(e) => editField("postalCode", e.target.value)}
                placeholder="43215"
                className="field"
              />
            </div>
            <div className="md:col-span-2">
              <label htmlFor={`${uid}-label`} className="field-label">
                Label
              </label>
              <input
                id={`${uid}-label`}
                type="text"
                value={form.label}
                onChange={(e) =>
                  setForm((f) => ({ ...f, label: e.target.value }))
                }
                placeholder="e.g. Rental, Main house"
                className="field"
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
              variant="ink"
              onClick={handleSave}
              disabled={isAdding || !canSave}
            >
              {isAdding ? "Saving…" : "Save location"}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

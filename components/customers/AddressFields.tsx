"use client";

import { useId } from "react";
import type { AddressSuggestion } from "@/lib/address/geoapify";
import { useAddressAutocomplete } from "@/lib/hooks/useAddressAutocomplete";

/** A structured US address as the forms edit it (every part a string). */
export interface AddressValue {
  street: string;
  unit: string;
  city: string;
  state: string;
  postalCode: string;
  lat?: number;
  lon?: number;
}

export const EMPTY_ADDRESS: AddressValue = {
  street: "",
  unit: "",
  city: "",
  state: "",
  postalCode: "",
};

/** Street, city, state and ZIP are all filled in. */
export function isAddressComplete(a: AddressValue): boolean {
  return Boolean(
    a.street.trim() && a.city.trim() && a.state.trim() && a.postalCode.trim()
  );
}

/** Nothing typed at all (an optional address left empty). */
export function isAddressBlank(a: AddressValue): boolean {
  return !(
    a.street.trim() ||
    a.unit.trim() ||
    a.city.trim() ||
    a.state.trim() ||
    a.postalCode.trim()
  );
}

/** Trimmed parts, ready for the API. */
export function trimAddress(a: AddressValue): AddressValue {
  return {
    street: a.street.trim(),
    unit: a.unit.trim(),
    city: a.city.trim(),
    state: a.state.trim(),
    postalCode: a.postalCode.trim(),
    lat: a.lat,
    lon: a.lon,
  };
}

/**
 * The street-with-autocomplete + unit/city/state/ZIP fields shared by the
 * New Customer panel and the customer page's add-location form. Picking a
 * suggestion fills every part and keeps its coordinates; hand-editing any
 * part drops them, so coordinates only persist while they match the address.
 */
export function AddressFields({
  value,
  onChange,
  required = true,
}: {
  value: AddressValue;
  onChange: (next: AddressValue) => void;
  /** Mark street/city/state/ZIP as required (off for an optional address). */
  required?: boolean;
}) {
  const uid = useId();
  const {
    suggestions,
    showSuggestions,
    query: queryAddress,
    cancelPending,
    openSuggestions,
    closeSuggestions,
  } = useAddressAutocomplete();
  const mark = required ? " *" : "";

  function editField(field: "city" | "state" | "postalCode", next: string) {
    onChange({ ...value, [field]: next, lat: undefined, lon: undefined });
  }

  function onStreetChange(next: string) {
    onChange({ ...value, street: next, lat: undefined, lon: undefined });
    queryAddress(next);
  }

  function pickSuggestion(s: AddressSuggestion) {
    cancelPending();
    onChange({
      ...value,
      street: s.street,
      city: s.city,
      state: s.state,
      postalCode: s.postalCode,
      lat: s.lat ?? undefined,
      lon: s.lon ?? undefined,
    });
    closeSuggestions();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <label htmlFor={`${uid}-street`} className="field-label">
          Street{mark}
        </label>
        <input
          id={`${uid}-street`}
          type="text"
          value={value.street}
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

      <div className="grid grid-cols-2 gap-x-3 gap-y-4">
        <div>
          <label htmlFor={`${uid}-unit`} className="field-label">
            Unit / Apt
          </label>
          <input
            id={`${uid}-unit`}
            type="text"
            value={value.unit}
            onChange={(e) => onChange({ ...value, unit: e.target.value })}
            placeholder="Apt, suite, unit"
            className="field"
          />
        </div>
        <div>
          <label htmlFor={`${uid}-city`} className="field-label">
            City{mark}
          </label>
          <input
            id={`${uid}-city`}
            type="text"
            value={value.city}
            onChange={(e) => editField("city", e.target.value)}
            placeholder="Columbus"
            className="field"
          />
        </div>
        <div>
          <label htmlFor={`${uid}-state`} className="field-label">
            State{mark}
          </label>
          <input
            id={`${uid}-state`}
            type="text"
            value={value.state}
            onChange={(e) => editField("state", e.target.value)}
            placeholder="OH"
            className="field"
          />
        </div>
        <div>
          <label htmlFor={`${uid}-zip`} className="field-label">
            ZIP{mark}
          </label>
          <input
            id={`${uid}-zip`}
            type="text"
            inputMode="numeric"
            value={value.postalCode}
            onChange={(e) => editField("postalCode", e.target.value)}
            placeholder="43215"
            className="field"
          />
        </div>
      </div>
    </div>
  );
}

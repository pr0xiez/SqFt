"use client";

import { useId, useState } from "react";
import {
  AddressFields,
  type AddressValue,
  EMPTY_ADDRESS,
  isAddressComplete,
  trimAddress,
} from "@/components/customers/AddressFields";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { MapPinIcon, PlusIcon } from "@/components/ui/icons";
import { Tag } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/cn";
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
  className?: string;
}

export function mapsHref(address: string): string {
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
  className,
}: Props) {
  const uid = useId();
  const [address, setAddress] = useState<AddressValue>(EMPTY_ADDRESS);
  const [label, setLabel] = useState("");

  function reset() {
    setAddress(EMPTY_ADDRESS);
    setLabel("");
  }

  async function handleSave() {
    try {
      await onAddLocation({ ...trimAddress(address), label: label.trim() });
      reset();
      onAddingChange(false);
    } catch {
      // Orchestrator surfaces the toast; keep inputs for a retry.
    }
  }

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
      className={className}
    >
      {locations.length === 0 && !adding ? (
        <p className="text-[14px] text-[var(--muted)]">
          No locations yet. Add one to start a site measure.
        </p>
      ) : (
        <ul className="-my-3 divide-y divide-[var(--line)]">
          {locations.map((loc) => (
            <li key={loc.id} className="flex flex-col gap-2.5 py-3.5">
              <div className="min-w-0">
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
              <div className="flex flex-wrap gap-2">
                {loc.address && (
                  <a
                    href={mapsHref(loc.address)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={buttonClasses({ size: "sm" })}
                  >
                    <MapPinIcon aria-hidden="true" />
                    Google Maps
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
          <AddressFields value={address} onChange={setAddress} />
          <div>
            <label htmlFor={`${uid}-label`} className="field-label">
              Label
            </label>
            <input
              id={`${uid}-label`}
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Rental, Main house"
              className="field"
            />
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
              disabled={isAdding || !isAddressComplete(address)}
            >
              {isAdding ? "Saving…" : "Save location"}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

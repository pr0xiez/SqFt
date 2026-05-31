"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { CustomerLocationSummary } from "@/lib/hooks/useCustomers";

interface Props {
  locations: CustomerLocationSummary[];
  adding: boolean;
  onAddingChange: (value: boolean) => void;
  onAddLocation: (address: string, label: string) => Promise<void>;
  onStartSiteMeasure: (locationId: number) => void;
  isAdding: boolean; // createLocation.isPending
  isStarting: boolean; // createSiteMeasure.isPending
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
  const [locAddress, setLocAddress] = useState("");
  const [locLabel, setLocLabel] = useState("");

  // Drive the create through the orchestrator callback; only reset the inputs
  // (and close the form) once it resolves, so a failed save keeps the draft.
  async function handleSave() {
    try {
      await onAddLocation(locAddress.trim(), locLabel.trim());
      setLocAddress("");
      setLocLabel("");
      onAddingChange(false);
    } catch {
      // Orchestrator surfaces the toast; keep the inputs for a retry.
    }
  }

  return (
    <div
      id="locations-card"
      className="bg-[var(--surface)] border border-[var(--line)] rounded-lg p-5 mb-4"
    >
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <h2 className="text-[15px] font-[700] tracking-[-0.015em]">
            Locations
          </h2>
        </div>
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.06em] mb-[5px]">
                Address *
              </div>
              <input
                type="text"
                value={locAddress}
                onChange={(e) => setLocAddress(e.target.value)}
                placeholder="Street, City"
                className="w-full text-[13px] border border-[var(--line)] bg-[var(--surface)] px-2.5 py-2 rounded-[5px] focus:outline-none focus:border-[var(--ink-2)] transition-[border-color] duration-150"
              />
            </div>
            <div>
              <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.06em] mb-[5px]">
                Label
              </div>
              <input
                type="text"
                value={locLabel}
                onChange={(e) => setLocLabel(e.target.value)}
                placeholder="e.g. Rental, Main house"
                className="w-full text-[13px] border border-[var(--line)] bg-[var(--surface)] px-2.5 py-2 rounded-[5px] focus:outline-none focus:border-[var(--ink-2)] transition-[border-color] duration-150"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              size="sm"
              onClick={() => {
                onAddingChange(false);
                setLocAddress("");
                setLocLabel("");
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={handleSave}
              disabled={isAdding || !locAddress.trim()}
            >
              {isAdding ? "Saving…" : "Save location"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

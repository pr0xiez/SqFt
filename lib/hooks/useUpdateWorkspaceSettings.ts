"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { readApiError } from "@/lib/api/errors";
import type { Org } from "@/lib/hooks/useOrg";

export type WorkspaceSettingsPatch = Partial<{
  name: string;
  timezone: string;
  locale: string;
  brandColor: string;
  tagline: string;
  showLicenseOnEstimates: boolean;
  defaultDepositPct: number;
  defaultValidityDays: number;
  defaultUnitLabel: string;
  defaultTerms: string;
}>;

async function patchOrg(patch: WorkspaceSettingsPatch): Promise<Org> {
  const res = await fetch("/api/org", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const err = await readApiError(res, "Failed to save workspace settings");
    throw new Error(err.message);
  }
  return (await res.json()) as Org;
}

export function useUpdateWorkspaceSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: patchOrg,
    onSuccess: (org) => {
      qc.setQueryData(["org"], org);
    },
  });
}

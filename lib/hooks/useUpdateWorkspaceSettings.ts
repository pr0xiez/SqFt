"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/hooks/apiFetch";
import { keys } from "@/lib/hooks/queryKeys";
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

function patchOrg(patch: WorkspaceSettingsPatch): Promise<Org> {
  return apiFetch<Org>(
    "/api/org",
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    },
    "Failed to save workspace settings"
  );
}

export function useUpdateWorkspaceSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: patchOrg,
    onSuccess: (org) => {
      qc.setQueryData(keys.org, org);
    },
  });
}

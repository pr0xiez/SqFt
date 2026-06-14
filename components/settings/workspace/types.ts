export type WorkspaceSettingsInitial = {
  id: string;
  name: string;
  licenseNumber: string | null;
  timezone: string;
  locale: string;
  brandColor: string;
  tagline: string | null;
  showLicenseOnEstimates: boolean;
  defaultDepositPct: number;
  defaultValidityDays: number;
  defaultUnitLabel: string;
  defaultTerms: string;
  stripeConnect: {
    onboardingStatus: string;
    chargesEnabled: boolean;
    requirementsDue: string[];
  };
};

export type WorkspaceSettingsForm = {
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
};

export function toForm(i: WorkspaceSettingsInitial): WorkspaceSettingsForm {
  return {
    name: i.name,
    timezone: i.timezone,
    locale: i.locale,
    brandColor: i.brandColor,
    tagline: i.tagline ?? "",
    showLicenseOnEstimates: i.showLicenseOnEstimates,
    defaultDepositPct: i.defaultDepositPct,
    defaultValidityDays: i.defaultValidityDays,
    defaultUnitLabel: i.defaultUnitLabel,
    defaultTerms: i.defaultTerms,
  };
}

import type { WorkspaceSettingsForm } from "./types";
export function DefaultsSection(_: {
  form: WorkspaceSettingsForm;
  onChange: (patch: Partial<WorkspaceSettingsForm>) => void;
}) {
  return null;
}

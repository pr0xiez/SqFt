/** The thin type stripe on agenda cards and the job sheet. */
export const EVENT_ACCENT: Record<string, string> = {
  job: "bg-[var(--accent)]",
  visit: "bg-[var(--warn)]",
  other: "bg-[var(--line-2)]",
};

export const EVENT_LABEL: Record<string, string> = {
  job: "Job",
  visit: "Visit",
  other: "Other",
};

export function eventAccent(type: string): string {
  return EVENT_ACCENT[type] ?? EVENT_ACCENT.other;
}

export function eventLabel(type: string): string {
  return EVENT_LABEL[type] ?? "Other";
}

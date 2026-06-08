export const EVENT_ACCENT: Record<string, string> = {
  job: "bg-[var(--accent)]",
  visit: "bg-[var(--gold)]",
  other: "bg-[var(--sage)]",
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

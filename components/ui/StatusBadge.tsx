import {
  CheckCircleIcon,
  CircleHalfIcon,
  EyeIcon,
  type Icon,
  PaperPlaneTiltIcon,
  PencilSimpleLineIcon,
  ProhibitIcon,
  WarningCircleIcon,
  XCircleIcon,
} from "@/components/ui/icons";
import { cn } from "@/lib/cn";

/**
 * Status tones. Colour is never the only signal: every status also carries
 * its own icon and label.
 */
export type StatusTone = "neutral" | "pending" | "ok" | "bad";

export const TONE_CLASSES: Record<StatusTone, string> = {
  neutral: "text-[var(--ink-2)] bg-[var(--surface-2)]",
  pending:
    "text-[var(--warn)] bg-[color-mix(in_oklab,var(--warn)_14%,transparent)]",
  ok: "text-[var(--ok)] bg-[color-mix(in_oklab,var(--ok)_14%,transparent)]",
  bad: "text-[var(--accent-ink)] bg-[var(--accent-wash)]",
};

/** Text colour only, for inline status words (e.g. in a meta line). */
export const TONE_TEXT: Record<StatusTone, string> = {
  neutral: "text-[var(--muted)]",
  pending: "text-[var(--warn)]",
  ok: "text-[var(--ok)]",
  bad: "text-[var(--accent-ink)]",
};

type StatusMeta = { tone: StatusTone; label: string; icon: Icon };

/** Estimate + invoice statuses share one vocabulary of tones. */
const STATUS_META: Record<string, StatusMeta> = {
  draft: { tone: "neutral", label: "Draft", icon: PencilSimpleLineIcon },
  sent: { tone: "pending", label: "Sent", icon: PaperPlaneTiltIcon },
  viewed: { tone: "pending", label: "Viewed", icon: EyeIcon },
  approved: { tone: "ok", label: "Approved", icon: CheckCircleIcon },
  declined: { tone: "bad", label: "Declined", icon: XCircleIcon },
  partial: { tone: "pending", label: "Partial", icon: CircleHalfIcon },
  paid: { tone: "ok", label: "Paid", icon: CheckCircleIcon },
  void: { tone: "neutral", label: "Void", icon: ProhibitIcon },
  overdue: { tone: "bad", label: "Overdue", icon: WarningCircleIcon },
};

export function statusMeta(status: string): StatusMeta {
  return (
    STATUS_META[status] ?? {
      tone: "neutral",
      label: status.charAt(0).toUpperCase() + status.slice(1),
      icon: PencilSimpleLineIcon,
    }
  );
}

export function statusTone(status: string): StatusTone {
  return statusMeta(status).tone;
}

const BADGE_BASE =
  "inline-flex items-center gap-1 h-[22px] px-[7px] rounded-[var(--r)] text-[12.5px] font-[560] leading-none whitespace-nowrap align-middle";

/** A status pill for an estimate or invoice status. */
export function StatusBadge({
  status,
  label,
  className,
}: {
  status: string;
  /** Override the default label (e.g. "Awaiting reply"). */
  label?: string;
  className?: string;
}) {
  const meta = statusMeta(status);
  const StatusIcon = meta.icon;
  return (
    <span className={cn(BADGE_BASE, TONE_CLASSES[meta.tone], className)}>
      <StatusIcon aria-hidden="true" weight="bold" className="size-[13px]" />
      {label ?? meta.label}
    </span>
  );
}

/** A tone pill with free text, for non-status tags (sources, roles, flags). */
export function Tag({
  tone = "neutral",
  icon: TagIcon,
  className,
  children,
  title,
}: {
  tone?: StatusTone;
  icon?: Icon;
  className?: string;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(BADGE_BASE, TONE_CLASSES[tone], className)}
    >
      {TagIcon ? (
        <TagIcon aria-hidden="true" weight="bold" className="size-[13px]" />
      ) : null}
      {children}
    </span>
  );
}

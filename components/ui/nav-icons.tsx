import type { ReactNode } from "react";
import type { IconId } from "@/lib/nav/items";

export function NavIcon({
  icon,
  active = false,
  size = 22,
  title,
}: {
  icon: IconId;
  active?: boolean;
  size?: number;
  title?: string;
}) {
  const props = {
    viewBox: "0 0 24 24",
    width: size,
    height: size,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: active ? 2 : 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  const paths: Record<IconId, ReactNode> = {
    dashboard: (
      <>
        <path d="M3 12L12 4l9 8" />
        <path d="M5 10v10h5v-6h4v6h5V10" />
      </>
    ),
    customers: (
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" />
      </>
    ),
    siteMeasures: (
      <>
        <rect x="5" y="3" width="14" height="18" rx="1.5" />
        <path d="M9 8h6M9 12h6M9 16h4" />
      </>
    ),
    estimates: (
      <>
        <rect x="5" y="3" width="14" height="18" rx="1.5" />
        <path d="M12 7v10" />
        <path d="M14.5 9.5c-.7-.7-1.7-.9-2.5-.5-1 .5-1.2 1.7-.4 2.3.7.5 1.7.5 2.4 1 .8.6.6 1.8-.4 2.3-.8.4-1.8.2-2.5-.5" />
      </>
    ),
    invoices: (
      <>
        <path d="M6 3h12v18l-2-1.5L14 21l-2-1.5L10 21l-2-1.5L6 21V3z" />
        <path d="M9 8h6M9 12h6" />
      </>
    ),
    myschedule: (
      <>
        <rect x="4" y="5" width="16" height="15" rx="1.5" />
        <path d="M4 9h16M9 3v4M15 3v4" />
        <path d="M9 14l2 2 3.5-3.8" />
      </>
    ),
    scheduleManager: (
      <>
        <rect x="4" y="5" width="16" height="15" rx="1.5" />
        <path d="M4 9h16M9 3v4M15 3v4" />
        <path d="M8 13h3M8 16h5" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
      </>
    ),
    admin: (
      <>
        <path d="M12 3l7 3v5c0 4.4-3 7.8-7 9-4-1.2-7-4.6-7-9V6l7-3z" />
        <path d="M9.2 12l2 2 3.6-3.8" />
      </>
    ),
    more: (
      <>
        <circle cx="5" cy="12" r="1.6" />
        <circle cx="12" cy="12" r="1.6" />
        <circle cx="19" cy="12" r="1.6" />
      </>
    ),
  };
  if (title) {
    return (
      <svg {...props}>
        <title>{title}</title>
        {paths[icon]}
      </svg>
    );
  }
  return (
    <svg {...props} aria-hidden="true">
      {paths[icon]}
    </svg>
  );
}

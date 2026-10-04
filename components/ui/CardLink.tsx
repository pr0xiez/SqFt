import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRightIcon } from "@/components/ui/icons";

/** "View all" style link for a card header. */
export function CardLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group inline-flex items-center gap-1 text-[13.5px] font-[560] text-[var(--ink-2)] no-underline whitespace-nowrap hover:text-[var(--ink)]"
    >
      {children}
      <ArrowRightIcon
        aria-hidden="true"
        className="size-[14px] transition-transform duration-300 ease-[var(--ease)] group-hover:translate-x-0.5"
      />
    </Link>
  );
}

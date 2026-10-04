import Link from "next/link";
import { BrandMark } from "@/components/ui/BrandMark";
import { buttonClasses } from "@/components/ui/Button";
import { ArrowRightIcon } from "@/components/ui/icons";

/**
 * Shared 404. App users land here from a mistyped URL; customers land here
 * from a dead estimate or invoice link (`notFound()` on a bad token), so the
 * copy speaks to both.
 */
export default function NotFound() {
  return (
    <div className="min-h-[100dvh] flex flex-col px-6 sm:px-10">
      <header className="h-20 flex items-center shrink-0">
        <BrandMark />
      </header>
      <main className="flex-1 flex items-center pb-20">
        <div className="max-w-[540px]">
          <p className="type-figure text-[14px] text-[var(--muted)] mb-4">
            404
          </p>
          <h1 className="type-display text-[clamp(2rem,1.6rem+1.6vw,2.8rem)]">
            This page doesn&rsquo;t exist.
          </h1>
          <p className="mt-4 text-[16px] text-[var(--ink-2)] max-w-[46ch]">
            The link may be mistyped, or the estimate or invoice it pointed to
            has been replaced. If a contractor sent it to you, ask them for a
            new link.
          </p>
          <Link
            href="/"
            className={buttonClasses({
              variant: "default",
              className: "group mt-8",
            })}
          >
            Go to SqFt
            <ArrowRightIcon
              aria-hidden="true"
              className="transition-transform duration-300 ease-[var(--ease)] group-hover:translate-x-[3px]"
            />
          </Link>
        </div>
      </main>
    </div>
  );
}

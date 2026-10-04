import Link from "next/link";
import { redirect } from "next/navigation";
import { CaretRightIcon } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireSession } from "@/lib/tenant";

export const metadata = { title: "Settings" };

type SettingsLink = { href: string; title: string; description: string };

function settingsLinksFor(role: string): SettingsLink[] {
  const links: SettingsLink[] = [];
  if (role === "admin") {
    links.push({
      href: "/settings/workspace",
      title: "Workspace",
      description:
        "Company identity, brand, and the defaults that new estimates inherit.",
    });
    links.push({
      href: "/settings/members",
      title: "Members",
      description: "Add teammates and set what they can see and do.",
    });
    links.push({
      href: "/settings/payments",
      title: "Payments",
      description:
        "Connect Stripe to accept card payments from customers on invoices.",
    });
    links.push({
      href: "/settings/integrations",
      title: "Integrations",
      description:
        "Connect QuickBooks Online to push customers, invoices, and payments into your books.",
    });
  }
  links.push({
    href: "/settings/line-item-templates",
    title: "Line item templates",
    description:
      "Predefined line items your team can drop into any estimate: name, description, rate, unit.",
  });
  return links;
}

export default async function SettingsPage() {
  const session = await requireSession();
  if (session.user.role === "crew") redirect("/schedule");

  const links = settingsLinksFor(session.user.role);

  return (
    <div className="max-w-[760px]">
      <PageHeader title="Settings" />
      <ul className="card divide-y divide-[var(--line)] overflow-hidden">
        {links.map((s) => (
          <li key={s.href}>
            <Link
              href={s.href}
              className="group flex items-center gap-4 px-5 py-4 no-underline text-[var(--ink)] transition-colors duration-150 hover:bg-[var(--hover)] focus-visible:outline-offset-[-2px]"
            >
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-[600] tracking-[-0.01em]">
                  {s.title}
                </div>
                <div className="mt-0.5 text-[13.5px] text-[var(--muted)]">
                  {s.description}
                </div>
              </div>
              <CaretRightIcon
                aria-hidden="true"
                className="size-4 shrink-0 text-[var(--muted)] transition-transform duration-300 ease-[var(--ease)] group-hover:translate-x-0.5 group-hover:text-[var(--ink)]"
              />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

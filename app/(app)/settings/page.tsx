import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/tenant";

export const metadata = { title: "Settings · SqFt" };

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
  }
  links.push({
    href: "/settings/line-item-templates",
    title: "Line item templates",
    description:
      "Predefined line items your team can drop into any estimate — name, description, rate, unit.",
  });
  return links;
}

export default async function SettingsPage() {
  const session = await requireSession();
  if (session.user.role === "crew") redirect("/schedule");

  const links = settingsLinksFor(session.user.role);

  return (
    <div className="max-w-[760px] mx-auto px-4 py-8">
      <h1 className="text-[24px] font-[700] tracking-[-0.02em] mb-6">
        Settings
      </h1>
      <ul className="divide-y divide-[var(--line)] border border-[var(--line)] rounded-[var(--r)] bg-[var(--surface)]">
        {links.map((s) => (
          <li key={s.href}>
            <Link
              href={s.href}
              className="block px-4 py-3 hover:bg-[var(--surface-2)]"
            >
              <div className="text-[14px] font-[600]">{s.title}</div>
              <div className="text-[12px] text-[var(--muted)] mt-0.5">
                {s.description}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

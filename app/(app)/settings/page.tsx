import Link from "next/link";

export const metadata = { title: "Settings · SqFt" };

const SETTINGS_LINKS = [
  {
    href: "/settings/line-item-templates",
    title: "Line item templates",
    description:
      "Predefined line items your team can drop into any quote — name, description, rate, unit.",
  },
];

export default function SettingsPage() {
  return (
    <div className="max-w-[760px] mx-auto px-4 py-8">
      <h1 className="text-[24px] font-[700] tracking-[-0.02em] mb-6">
        Settings
      </h1>
      <ul className="divide-y divide-[var(--line)] border border-[var(--line)] rounded-[var(--r)] bg-[var(--surface)]">
        {SETTINGS_LINKS.map((s) => (
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

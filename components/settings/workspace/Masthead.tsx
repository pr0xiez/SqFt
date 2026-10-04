import { BackLink, PageHeader } from "@/components/ui/PageHeader";

type Props = { companyName: string; licenseNumber: string | null };

export function Masthead({ companyName, licenseNumber: _ }: Props) {
  return (
    <PageHeader
      title="Workspace"
      kicker={<BackLink href="/settings">Settings</BackLink>}
      meta={
        <span className="max-w-[62ch]">
          How{" "}
          <strong className="text-[var(--ink)] font-[600]">
            {companyName || "your business"}
          </strong>{" "}
          shows up to customers, what your defaults look like, and who can do
          what. Changes apply to every estimate and invoice going forward.
        </span>
      }
    />
  );
}

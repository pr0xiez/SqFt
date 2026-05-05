import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { OnboardingForm } from "./OnboardingForm";

export const metadata = { title: "Getting Started — SqFt" };

// Signup creates orgs with this placeholder name. Once the user picks a real
// name the org is considered configured and /onboarding should redirect away.
const PLACEHOLDER_NAME = "My Company";

export default async function OnboardingPage() {
  const session = await auth();

  // Only redirect authenticated users whose org is already configured.
  // Unauthenticated visitors (e.g. users who just signed up but haven't
  // logged in yet) see the form; their POST will 401 until they log in.
  if (session?.user?.orgId) {
    const org = await prisma.organization.findUnique({
      where: { id: session.user.orgId },
      select: { name: true },
    });

    if (org && org.name !== PLACEHOLDER_NAME) {
      redirect("/");
    }
  }

  return <OnboardingForm />;
}

export type SubscriptionStatus =
  | "manual"
  | "trialing"
  | "active"
  | "past_due"
  | "unpaid"
  | "canceled";

export type AdminOrgRow = {
  id: string;
  name: string;
  slug: string;
  subscriptionStatus: SubscriptionStatus;
  trialEndsAt: string | null;
  currentPeriodEndsAt: string | null;
  createdAt: string;
  userCount: number;
};

export type CreateAdminOrgInput = {
  orgName: string;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
};

export type CreateAdminOrgResult = {
  orgId: string;
  slug: string;
  adminEmail: string;
};

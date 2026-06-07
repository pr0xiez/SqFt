export type MemberRole = "admin" | "lead" | "crew";

export type MemberRow = {
  id: string;
  name: string;
  email: string;
  role: MemberRole;
  title: string | null;
  archived: boolean;
  createdAt: string;
};

export type CreateMemberInput = {
  name: string;
  email: string;
  role: MemberRole;
  password: string;
};

export type UpdateMemberInput = {
  id: string;
  role?: MemberRole;
  title?: string | null;
  archived?: boolean;
};

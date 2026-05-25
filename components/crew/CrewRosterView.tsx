"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { CrewAvatar } from "@/components/ui/CrewAvatar";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import {
  type CrewMember,
  useCreateCrewMember,
  useCrewMembers,
  useUpdateCrewMember,
} from "@/lib/hooks/useCrewMembers";

export function CrewRosterView({ canEdit }: { canEdit: boolean }) {
  const { data: all = [], isLoading } = useCrewMembers({
    includeArchived: true,
  });
  const create = useCreateCrewMember();
  const { showToast } = useToast();
  const [adding, setAdding] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const active = all.filter((m) => !m.archived);
  const archived = all.filter((m) => m.archived);

  return (
    <div className="max-w-[640px] mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[24px] font-[700] tracking-[-0.02em]">Crew</h1>
        {canEdit && !adding && (
          <Button onClick={() => setAdding(true)}>+ Add crew member</Button>
        )}
      </div>

      {canEdit && adding && (
        <AddRow
          onCancel={() => setAdding(false)}
          onSave={async (input) => {
            try {
              await create.mutateAsync(input);
              setAdding(false);
              showToast("Crew member added");
            } catch {
              showToast("Failed to add crew member");
            }
          }}
        />
      )}

      {isLoading ? (
        <div className="text-[var(--muted)]">Loading…</div>
      ) : active.length === 0 ? (
        <div className="text-[var(--muted)] py-6">
          No crew yet. Add your first crew member above.
        </div>
      ) : (
        <ul className="divide-y divide-[var(--line)] border border-[var(--line)] rounded-[var(--r)] bg-[var(--surface)]">
          {active.map((m) => (
            <RosterRow key={m.id} member={m} canEdit={canEdit} />
          ))}
        </ul>
      )}

      {archived.length > 0 && (
        <div className="mt-6">
          <button
            type="button"
            onClick={() => setShowArchived((s) => !s)}
            className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] hover:text-[var(--ink)]"
          >
            {showArchived ? "▾" : "▸"} Archived ({archived.length})
          </button>
          {showArchived && (
            <ul className="mt-2 divide-y divide-[var(--line)] border border-[var(--line)] rounded-[var(--r)] bg-[var(--surface)]">
              {archived.map((m) => (
                <RosterRow key={m.id} member={m} archived canEdit={canEdit} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function AddRow(props: {
  onSave: (input: { name: string; role?: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  return (
    <div className="border border-[var(--line)] rounded-[var(--r)] bg-[var(--surface)] p-3 mb-4 flex gap-2 items-center">
      <input
        // biome-ignore lint/a11y/noAutofocus: inline-edit row — focus is the explicit affordance
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name (required)"
        className="flex-1 px-2 py-1.5 bg-transparent border border-[var(--line)] rounded-[4px] text-[14px]"
      />
      <input
        value={role}
        onChange={(e) => setRole(e.target.value)}
        placeholder="Role (optional)"
        className="flex-1 px-2 py-1.5 bg-transparent border border-[var(--line)] rounded-[4px] text-[14px]"
      />
      <Button
        onClick={() =>
          name.trim() && props.onSave({ name: name.trim(), role: role.trim() })
        }
      >
        Save
      </Button>
      <Button variant="ghost" onClick={props.onCancel}>
        Cancel
      </Button>
    </div>
  );
}

function RosterRow({
  member,
  archived = false,
  canEdit,
}: {
  member: CrewMember;
  archived?: boolean;
  canEdit: boolean;
}) {
  const update = useUpdateCrewMember(member.id);
  const { showToast } = useToast();
  const [editingName, setEditingName] = useState(false);
  const [editingRole, setEditingRole] = useState(false);
  const [name, setName] = useState(member.name);
  const [role, setRole] = useState(member.role);

  async function commitName() {
    setEditingName(false);
    if (name.trim() === "" || name === member.name) {
      setName(member.name);
      return;
    }
    try {
      await update.mutateAsync({ name: name.trim() });
      showToast("Crew member updated");
    } catch {
      setName(member.name);
      showToast("Failed to update");
    }
  }
  async function commitRole() {
    setEditingRole(false);
    if (role === member.role) return;
    try {
      await update.mutateAsync({ role });
      showToast("Crew member updated");
    } catch {
      setRole(member.role);
    }
  }
  async function toggleArchive() {
    try {
      await update.mutateAsync({ archived: !member.archived });
      showToast(member.archived ? "Restored" : "Archived");
    } catch {
      showToast("Failed");
    }
  }

  return (
    <li
      className={cn(
        "flex items-center gap-3 px-3 py-2.5",
        archived && "opacity-70"
      )}
    >
      <CrewAvatar name={member.name} size="lg" />
      <div className="flex-1 min-w-0">
        {editingName ? (
          <input
            // biome-ignore lint/a11y/noAutofocus: inline-edit toggled on click — focus is the explicit affordance
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitName();
              if (e.key === "Escape") {
                setName(member.name);
                setEditingName(false);
              }
            }}
            className="w-full px-1 py-0.5 bg-transparent border border-[var(--line)] rounded-[3px] text-[14px]"
          />
        ) : (
          <button
            type="button"
            onClick={() => canEdit && !archived && setEditingName(true)}
            className="text-[14px] font-[600] text-left hover:underline"
            disabled={!canEdit || archived}
          >
            {member.name}
          </button>
        )}
        {editingRole ? (
          <input
            // biome-ignore lint/a11y/noAutofocus: inline-edit toggled on click — focus is the explicit affordance
            autoFocus
            value={role}
            onChange={(e) => setRole(e.target.value)}
            onBlur={commitRole}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRole();
              if (e.key === "Escape") {
                setRole(member.role);
                setEditingRole(false);
              }
            }}
            className="w-full mt-0.5 px-1 py-0.5 bg-transparent border border-[var(--line)] rounded-[3px] text-[12px]"
          />
        ) : (
          <button
            type="button"
            onClick={() => canEdit && !archived && setEditingRole(true)}
            className="block text-[12px] text-[var(--muted)] hover:underline text-left"
            disabled={!canEdit || archived}
          >
            {member.role || (archived ? "—" : "Add role")}
          </button>
        )}
      </div>
      {canEdit && (
        <Button variant="ghost" onClick={toggleArchive}>
          {archived ? "Restore" : "Archive"}
        </Button>
      )}
    </li>
  );
}

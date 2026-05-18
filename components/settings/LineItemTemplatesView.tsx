"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { DecimalInput } from "@/components/ui/DecimalInput";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import {
  type LineItemTemplate,
  useCreateLineItemTemplate,
  useDeleteLineItemTemplate,
  useLineItemTemplates,
  useUpdateLineItemTemplate,
} from "@/lib/hooks/useLineItemTemplates";

export function LineItemTemplatesView() {
  const { data: all = [], isLoading } = useLineItemTemplates({
    includeArchived: true,
  });
  const create = useCreateLineItemTemplate();
  const { showToast } = useToast();
  const [adding, setAdding] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const active = all.filter((t) => !t.archived);
  const archived = all.filter((t) => t.archived);

  return (
    <div className="max-w-[760px] mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-[24px] font-[700] tracking-[-0.02em]">
          Line item templates
        </h1>
        {!adding && (
          <Button onClick={() => setAdding(true)}>+ Add template</Button>
        )}
      </div>
      <p className="text-[13px] text-[var(--muted)] mb-6">
        Predefined line items your team can drop into any quote. Editing a
        template does not change quotes that already used it.
      </p>

      {adding && (
        <AddRow
          onCancel={() => setAdding(false)}
          onSave={async (input) => {
            try {
              await create.mutateAsync(input);
              setAdding(false);
              showToast("Template added");
            } catch {
              showToast("Failed to add template");
            }
          }}
        />
      )}

      {isLoading ? (
        <div className="text-[var(--muted)]">Loading…</div>
      ) : active.length === 0 ? (
        <div className="text-[var(--muted)] py-6">
          No templates yet. Add one above so it shows up in the line item
          dropdown on every quote.
        </div>
      ) : (
        <ul className="divide-y divide-[var(--line)] border border-[var(--line)] rounded-[var(--r)] bg-[var(--surface)]">
          {active.map((t) => (
            <TemplateRow key={t.id} template={t} />
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
              {archived.map((t) => (
                <TemplateRow key={t.id} template={t} archived />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function AddRow(props: {
  onSave: (input: {
    name: string;
    description?: string | null;
    rate: number;
    unitLabel: string;
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [rate, setRate] = useState<number | null>(0);
  const [unitLabel, setUnitLabel] = useState("sqft");
  return (
    <div className="border border-[var(--line)] rounded-[var(--r)] bg-[var(--surface)] p-3 mb-4 space-y-2">
      <div className="flex gap-2 items-center">
        <input
          // biome-ignore lint/a11y/noAutofocus: inline-edit row — focus is the explicit affordance
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (required) — e.g. LVP install"
          className="flex-1 px-2 py-1.5 bg-transparent border border-[var(--line)] rounded-[4px] text-[14px]"
        />
        <div className="relative w-[110px]">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 font-[var(--font-mono)] text-[11px] text-[var(--muted)]">
            $
          </span>
          <DecimalInput
            value={rate}
            onCommit={(v) => setRate(v ?? 0)}
            formatOnBlur
            className="w-full px-2 pl-5 py-1.5 bg-transparent border border-[var(--line)] rounded-[4px] text-[14px]"
          />
        </div>
        <input
          value={unitLabel}
          onChange={(e) => setUnitLabel(e.target.value)}
          placeholder="unit"
          className="w-[80px] px-2 py-1.5 bg-transparent border border-[var(--line)] rounded-[4px] text-[14px]"
        />
      </div>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
        rows={2}
        className="w-full px-2 py-1.5 bg-transparent border border-[var(--line)] rounded-[4px] text-[13px] resize-y"
      />
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" onClick={props.onCancel}>
          Cancel
        </Button>
        <Button
          onClick={() =>
            name.trim() &&
            props.onSave({
              name: name.trim(),
              description: description.trim() || null,
              rate: rate ?? 0,
              unitLabel: unitLabel.trim() || "ft²",
            })
          }
        >
          Save
        </Button>
      </div>
    </div>
  );
}

function TemplateRow({
  template,
  archived = false,
}: {
  template: LineItemTemplate;
  archived?: boolean;
}) {
  const update = useUpdateLineItemTemplate(template.id);
  const del = useDeleteLineItemTemplate();
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description ?? "");
  const [rate, setRate] = useState<number | null>(template.rate);
  const [unitLabel, setUnitLabel] = useState(template.unitLabel);

  async function commit() {
    try {
      await update.mutateAsync({
        name: name.trim(),
        description: description.trim() || null,
        rate: rate ?? 0,
        unitLabel: unitLabel.trim() || "ft²",
      });
      setEditing(false);
      showToast("Template saved");
    } catch {
      showToast("Failed to save");
    }
  }

  async function toggleArchive() {
    try {
      await update.mutateAsync({ archived: !template.archived });
      showToast(template.archived ? "Restored" : "Archived");
    } catch {
      showToast("Failed");
    }
  }

  async function remove() {
    if (!confirm(`Delete template "${template.name}"?`)) return;
    try {
      await del.mutateAsync(template.id);
      showToast("Template deleted");
    } catch {
      showToast("Failed to delete");
    }
  }

  if (editing) {
    return (
      <li className="p-3 space-y-2">
        <div className="flex gap-2 items-center">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 px-2 py-1.5 bg-transparent border border-[var(--line)] rounded-[4px] text-[14px]"
          />
          <div className="relative w-[110px]">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 font-[var(--font-mono)] text-[11px] text-[var(--muted)]">
              $
            </span>
            <DecimalInput
              value={rate}
              onCommit={(v) => setRate(v ?? 0)}
              formatOnBlur
              className="w-full px-2 pl-5 py-1.5 bg-transparent border border-[var(--line)] rounded-[4px] text-[14px]"
            />
          </div>
          <input
            value={unitLabel}
            onChange={(e) => setUnitLabel(e.target.value)}
            className="w-[80px] px-2 py-1.5 bg-transparent border border-[var(--line)] rounded-[4px] text-[14px]"
          />
        </div>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          rows={2}
          className="w-full px-2 py-1.5 bg-transparent border border-[var(--line)] rounded-[4px] text-[13px] resize-y"
        />
        <div className="flex gap-2 justify-end">
          <Button
            variant="ghost"
            onClick={() => {
              setEditing(false);
              setName(template.name);
              setDescription(template.description ?? "");
              setRate(template.rate);
              setUnitLabel(template.unitLabel);
            }}
          >
            Cancel
          </Button>
          <Button onClick={commit}>Save</Button>
        </div>
      </li>
    );
  }

  return (
    <li
      className={cn(
        "flex items-start gap-3 px-3 py-3",
        archived && "opacity-70"
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-3 flex-wrap">
          <div className="text-[14px] font-[600] tracking-[-0.005em]">
            {template.name}
          </div>
          <div className="font-[var(--font-mono)] text-[11px] text-[var(--muted)]">
            ${template.rate.toFixed(2)} / {template.unitLabel}
          </div>
        </div>
        {template.description && (
          <div className="mt-1 text-[12px] text-[var(--muted)] whitespace-pre-wrap">
            {template.description}
          </div>
        )}
      </div>
      <div className="flex gap-1.5 shrink-0">
        {!archived && (
          <Button variant="ghost" onClick={() => setEditing(true)}>
            Edit
          </Button>
        )}
        <Button variant="ghost" onClick={toggleArchive}>
          {archived ? "Restore" : "Archive"}
        </Button>
        {archived && (
          <Button variant="ghost" onClick={remove}>
            Delete
          </Button>
        )}
      </div>
    </li>
  );
}

"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { DecimalInput } from "@/components/ui/DecimalInput";
import { EmptyState, LoadingRows } from "@/components/ui/EmptyState";
import {
  CaretDownIcon,
  CaretRightIcon,
  ListChecksIcon,
  PlusIcon,
} from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/Toast";
import {
  CELL,
  CELL_FIGURE,
  CELL_PRIMARY,
  TABLE_HEAD,
  TABLE_HEAD_CELL,
  TABLE_SHELL,
} from "@/components/ui/table";
import { cn } from "@/lib/cn";
import {
  type LineItemTemplate,
  useCreateLineItemTemplate,
  useDeleteLineItemTemplate,
  useLineItemTemplates,
  useUpdateLineItemTemplate,
} from "@/lib/hooks/useLineItemTemplates";
import { fmtDollar } from "@/lib/utils";

const TEMPLATE_GRID = "md:grid-cols-[minmax(0,1fr)_150px_auto]";

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
    <div className="max-w-[960px]">
      <PageHeader
        title="Line item templates"
        meta="Predefined line items your team can drop into any estimate. Editing a template does not change estimates that already used it."
        actions={
          !adding && (
            <Button variant="primary" onClick={() => setAdding(true)}>
              <PlusIcon aria-hidden="true" />
              Add template
            </Button>
          )
        }
      />

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
        <div className={TABLE_SHELL}>
          <LoadingRows rows={4} />
        </div>
      ) : active.length === 0 ? (
        <div className={TABLE_SHELL}>
          <EmptyState
            icon={ListChecksIcon}
            title="No templates yet."
            body="Add one above so it shows up in the line item dropdown on every estimate."
          />
        </div>
      ) : (
        <div className={TABLE_SHELL}>
          <TemplateTableHead />
          <ul>
            {active.map((t) => (
              <TemplateRow key={t.id} template={t} />
            ))}
          </ul>
        </div>
      )}

      {archived.length > 0 && (
        <div className="mt-8">
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3"
            aria-expanded={showArchived}
            onClick={() => setShowArchived((s) => !s)}
          >
            {showArchived ? (
              <CaretDownIcon aria-hidden="true" />
            ) : (
              <CaretRightIcon aria-hidden="true" />
            )}
            Archived (<span className="type-figure">{archived.length}</span>)
          </Button>
          {showArchived && (
            <div className={cn(TABLE_SHELL, "mt-2")}>
              <ul>
                {archived.map((t) => (
                  <TemplateRow key={t.id} template={t} archived />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TemplateTableHead() {
  return (
    <div className={cn(TABLE_HEAD, TEMPLATE_GRID)}>
      <div className={TABLE_HEAD_CELL}>Template</div>
      <div className={cn(TABLE_HEAD_CELL, "text-right")}>Rate</div>
      <div className={TABLE_HEAD_CELL}>
        <span className="sr-only">Actions</span>
      </div>
    </div>
  );
}

type FieldsProps = {
  name: string;
  setName: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  rate: number | null;
  setRate: (v: number | null) => void;
  unitLabel: string;
  setUnitLabel: (v: string) => void;
  /** The add row focuses the name and shows example placeholders. */
  isNew?: boolean;
};

function TemplateFields(p: FieldsProps) {
  const id = useId();
  return (
    <div className="grid grid-cols-2 md:grid-cols-[minmax(0,1fr)_140px_110px] gap-3">
      <div className="col-span-2 md:col-span-1">
        <label htmlFor={`${id}-name`} className="field-label">
          Name
        </label>
        <input
          id={`${id}-name`}
          // biome-ignore lint/a11y/noAutofocus: inline-edit row — focus is the explicit affordance
          autoFocus={p.isNew}
          value={p.name}
          onChange={(e) => p.setName(e.target.value)}
          placeholder={
            p.isNew ? "Name (required), e.g. LVP install" : undefined
          }
          className="field"
        />
      </div>
      <div>
        <label htmlFor={`${id}-rate`} className="field-label">
          Rate
        </label>
        <div className="relative">
          <span
            aria-hidden="true"
            className="absolute left-3 top-1/2 -translate-y-1/2 type-figure text-[14px] text-[var(--muted)] pointer-events-none"
          >
            $
          </span>
          <DecimalInput
            id={`${id}-rate`}
            value={p.rate}
            onCommit={(v) => p.setRate(v ?? 0)}
            formatOnBlur
            className="field pl-7 type-figure text-right"
          />
        </div>
      </div>
      <div>
        <label htmlFor={`${id}-unit`} className="field-label">
          Unit
        </label>
        <input
          id={`${id}-unit`}
          value={p.unitLabel}
          onChange={(e) => p.setUnitLabel(e.target.value)}
          placeholder={p.isNew ? "unit" : undefined}
          className="field"
        />
      </div>
      <div className="col-span-2 md:col-span-3">
        <label htmlFor={`${id}-description`} className="field-label">
          Description
        </label>
        <textarea
          id={`${id}-description`}
          value={p.description}
          onChange={(e) => p.setDescription(e.target.value)}
          placeholder="Description (optional)"
          rows={2}
          className="field"
        />
      </div>
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
    <div className="card p-5 md:p-6 mb-4">
      <h2 className="type-heading mb-4">New template</h2>
      <TemplateFields
        isNew
        name={name}
        setName={setName}
        description={description}
        setDescription={setDescription}
        rate={rate}
        setRate={setRate}
        unitLabel={unitLabel}
        setUnitLabel={setUnitLabel}
      />
      <div className="flex gap-2 justify-end mt-4">
        <Button variant="ghost" onClick={props.onCancel}>
          Cancel
        </Button>
        <Button
          variant="primary"
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
      <li className="px-3.5 md:px-5 py-4 border-b border-[var(--line)] last:border-b-0">
        <TemplateFields
          name={name}
          setName={setName}
          description={description}
          setDescription={setDescription}
          rate={rate}
          setRate={setRate}
          unitLabel={unitLabel}
          setUnitLabel={setUnitLabel}
        />
        <div className="flex gap-2 justify-end mt-4">
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
          <Button variant="ink" onClick={commit}>
            Save
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-y-2 py-3.5 border-b border-[var(--line)] last:border-b-0",
        TEMPLATE_GRID,
        archived && "text-[var(--ink-2)]"
      )}
    >
      <div className={cn(CELL, "col-span-2 md:col-span-1 min-w-0")}>
        <div className={CELL_PRIMARY}>{template.name}</div>
        {template.description && (
          <div className="mt-1 text-[13.5px] text-[var(--muted)] whitespace-pre-wrap">
            {template.description}
          </div>
        )}
      </div>
      <div className={cn(CELL, "md:text-right whitespace-nowrap")}>
        <span className={cn(CELL_FIGURE, "font-[600]")}>
          {fmtDollar(template.rate)}
        </span>
        <span className="text-[13px] text-[var(--muted)]">
          {" "}
          / {template.unitLabel}
        </span>
      </div>
      <div className={cn(CELL, "flex gap-1.5 justify-end")}>
        {!archived && (
          <Button size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
        )}
        <Button
          size="sm"
          variant={archived ? "default" : "ghost"}
          className={
            archived
              ? undefined
              : "hover:text-[var(--accent-ink)] hover:bg-[var(--accent-wash)]"
          }
          onClick={toggleArchive}
        >
          {archived ? "Restore" : "Archive"}
        </Button>
        {archived && (
          <Button size="sm" variant="danger" onClick={remove}>
            Delete
          </Button>
        )}
      </div>
    </li>
  );
}

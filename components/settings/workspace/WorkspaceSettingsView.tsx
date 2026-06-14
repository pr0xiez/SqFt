"use client";

import { useCallback, useMemo, useState } from "react";
import { useUpdateWorkspaceSettings } from "@/lib/hooks/useUpdateWorkspaceSettings";
import { BrandSection } from "./BrandSection";
import { DefaultsSection } from "./DefaultsSection";
import { IdentitySection } from "./IdentitySection";
import { Masthead } from "./Masthead";
import { PaymentsSection } from "./PaymentsSection";
import { SaveBar } from "./SaveBar";
import { Toc } from "./Toc";
import {
  toForm,
  type WorkspaceSettingsForm,
  type WorkspaceSettingsInitial,
} from "./types";

type Props = { initial: WorkspaceSettingsInitial; justReturned: boolean };

export function WorkspaceSettingsView({ initial, justReturned }: Props) {
  const [snapshot, setSnapshot] = useState<WorkspaceSettingsForm>(() =>
    toForm(initial)
  );
  const [form, setForm] = useState<WorkspaceSettingsForm>(snapshot);
  const dirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(snapshot),
    [form, snapshot]
  );

  const update = useUpdateWorkspaceSettings();

  const onChange = useCallback((patch: Partial<WorkspaceSettingsForm>) => {
    setForm((f) => ({ ...f, ...patch }));
  }, []);

  const onRevert = useCallback(() => setForm(snapshot), [snapshot]);

  const onSave = useCallback(async () => {
    const diff: Partial<WorkspaceSettingsForm> = {};
    (Object.keys(form) as (keyof WorkspaceSettingsForm)[]).forEach((k) => {
      if (form[k] !== snapshot[k]) {
        // biome-ignore lint/suspicious/noExplicitAny: heterogeneous key copy
        (diff as any)[k] = form[k];
      }
    });
    if (Object.keys(diff).length === 0) return;
    const saved = await update.mutateAsync(diff);
    const nextSnap = toForm({
      ...initial,
      ...saved,
      tagline: saved.tagline,
    });
    setSnapshot(nextSnap);
    setForm(nextSnap);
  }, [form, snapshot, update, initial]);

  return (
    <>
      <Masthead companyName={form.name} licenseNumber={initial.licenseNumber} />
      <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-14 max-w-[1180px] mx-auto px-12 pt-10 pb-[200px]">
        <Toc />
        <main className="min-w-0">
          <IdentitySection form={form} onChange={onChange} />
          <BrandSection
            form={form}
            licenseNumber={initial.licenseNumber}
            onChange={onChange}
          />
          <DefaultsSection form={form} onChange={onChange} />
          <PaymentsSection
            initial={initial.stripeConnect}
            justReturned={justReturned}
          />
        </main>
      </div>
      <SaveBar
        dirty={dirty}
        saving={update.isPending}
        onSave={onSave}
        onRevert={onRevert}
      />
    </>
  );
}

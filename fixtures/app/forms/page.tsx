"use client";

import { Suspense, useCallback, useState } from "react";
import { DemoPageBar, useDemoLocale } from "../../components/demo-i18n-provider";
import { Save, Settings2, ShieldCheck } from "lucide-react";
import {
  AdminBanner,
  AdminField,
  AdminFieldGrid,
  AdminFormActions,
  AdminFormCard,
  AdminInput,
  AdminManagedForm,
  AdminRepeaterListField,
  AdminSectionCard,
  AdminSelect,
  AdminSplitFormLayout,
  AdminSubmitButton,
  Button,
  type AdminFormActionState,
} from "@yesvus/helmdeck";

export default function FormsPage() {
  const { copy } = useDemoLocale();
  const [name, setName] = useState("Northstar Operations");

  const save = useCallback(async (_state: AdminFormActionState, formData: FormData) => {
    await new Promise((resolve) => window.setTimeout(resolve, 450));
    return {
      status: "success" as const,
      message: copy.forms.ready(String(formData.get("workspace") || "Workspace")),
      feedbackKey: String(Date.now()),
    };
  }, [copy.forms]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 lg:px-8">
      <DemoPageBar />
      <Suspense fallback={<div className="rounded-xl border border-zinc-200 bg-white p-8">{copy.forms.loading}</div>}>
        <AdminManagedForm
      action={save}
      autosaveKey={({ pathname }) => pathname}
      className="space-y-6"
      feedbackLabels={{ successTitle: copy.forms.successTitle, errorTitle: copy.forms.errorTitle }}
    >
      <AdminSectionCard
        icon={Settings2}
        title={copy.forms.profileTitle}
        description={copy.forms.profileDescription}
        action={<AdminBanner body={copy.forms.fixtureBody} title={copy.forms.fixtureTitle} tone="info" />}
      >
        <AdminSplitFormLayout
          content={
            <div className="space-y-5">
              <AdminFormCard title={copy.forms.identity} subtitle={copy.forms.identityBody}>
                <AdminFieldGrid>
                  <AdminField id="workspace-name" label={copy.forms.workspaceName} hint={copy.forms.workspaceHint}>
                    <AdminInput
                      id="workspace-name"
                      name="workspace"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                    />
                  </AdminField>
                  <AdminField id="environment" label={copy.forms.environment}>
                    <AdminSelect id="environment" name="environment" defaultValue="preview">
                      <option value="preview">{copy.forms.preview}</option>
                      <option value="production">{copy.forms.production}</option>
                    </AdminSelect>
                  </AdminField>
                </AdminFieldGrid>
              </AdminFormCard>
              <AdminFormCard title={copy.forms.capabilities} subtitle={copy.forms.capabilitiesBody}>
                <AdminRepeaterListField
                  addLabel={copy.forms.addCapability}
                  defaultItems={[copy.forms.catalogManagement, copy.forms.mediaOperations]}
                  itemLabel={copy.forms.capability}
                  label={copy.forms.enabledCapabilities}
                  name="capabilities"
                />
              </AdminFormCard>
            </div>
          }
          sidebar={
            <div className="space-y-4">
              <AdminFormCard accent="muted" title={copy.forms.publishing}>
                <div className="space-y-3 text-sm text-zinc-600">
                  <p>{copy.forms.publishingBodyOne}</p>
                  <p>{copy.forms.publishingBodyTwo}</p>
                </div>
              </AdminFormCard>
              <AdminFormCard title={copy.forms.access} subtitle={copy.forms.accessBody}>
                <div className="flex items-start gap-3 text-sm text-zinc-600">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                  <p>{copy.forms.accessPolicy}</p>
                </div>
              </AdminFormCard>
            </div>
          }
        />
      </AdminSectionCard>
      <AdminFormActions>
        <Button type="reset" variant="outline">{copy.forms.reset}</Button>
        <AdminSubmitButton icon={<Save className="h-4 w-4" />} label={copy.forms.save} pendingLabel={copy.forms.saving} />
      </AdminFormActions>
        </AdminManagedForm>
      </Suspense>
    </main>
  );
}

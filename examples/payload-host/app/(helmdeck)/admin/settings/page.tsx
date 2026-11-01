// SPDX-License-Identifier: MIT
import { AdminPageHeader } from "@yesvus/helmdeck";
import { PERMISSIONS } from "@/lib/permissions";
import { requireAdminSession } from "@/lib/guard";
import { readPayloadSiteSettingsAction, writePayloadSiteSettingsAction } from "@/lib/payload/settings-actions";

async function saveSettings(formData: FormData) {
  "use server";
  await requireAdminSession({ returnTo: "/admin/settings" });
  const values = {
    name: String(formData.get("name") ?? ""),
    accent: String(formData.get("accent") ?? ""),
    support_email: String(formData.get("support_email") ?? ""),
    density: String(formData.get("density") ?? ""),
  };
  await writePayloadSiteSettingsAction(values);
}

export default async function SettingsPage() {
  await requireAdminSession({ returnTo: "/admin/settings" });
  const settings = await readPayloadSiteSettingsAction();

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Site settings" />
      <form action={saveSettings} className="space-y-4 max-w-lg">
        <label className="block text-sm">
          Name
          <input name="name" defaultValue={String(settings.name ?? "")} className="mt-1 w-full rounded border px-2 py-1" />
        </label>
        <label className="block text-sm">
          Accent
          <input name="accent" defaultValue={String(settings.accent ?? "")} className="mt-1 w-full rounded border px-2 py-1" />
        </label>
        <label className="block text-sm">
          Support email
          <input name="support_email" defaultValue={String(settings.support_email ?? "")} className="mt-1 w-full rounded border px-2 py-1" />
        </label>
        <label className="block text-sm">
          Density
          <select name="density" defaultValue={String(settings.density ?? "comfortable")} className="mt-1 w-full rounded border px-2 py-1">
            <option value="comfortable">Comfortable</option>
            <option value="compact">Compact</option>
            <option value="cosy">Cosy</option>
          </select>
        </label>
        <button type="submit" className="rounded bg-brand-600 px-4 py-2 text-sm text-white">Save</button>
      </form>
    </div>
  );
}
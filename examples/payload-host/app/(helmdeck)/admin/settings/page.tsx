// SPDX-License-Identifier: MIT
import { AdminPageHeader } from "@yesvus/helmdeck";
import { requireAdminSession } from "@/lib/guard";
import { readPayloadSiteSettingsAction } from "@/lib/payload/settings-actions";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  await requireAdminSession({ returnTo: "/admin/settings" });
  const settings = await readPayloadSiteSettingsAction();

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Site settings" />
      <SettingsForm settings={settings} />
    </div>
  );
}

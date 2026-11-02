// SPDX-License-Identifier: MIT
import { Activity } from "lucide-react";
import { AdminActivityPage, AdminPageHeader, AdminSectionCard } from "@yesvus/helmdeck";
import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/guard";
import { principal, isAdmin } from "@/lib/rules";
import { payloadContent } from "@/lib/payload/content";
import { createAdminPayloadActivityLoader } from "@yesvus/helmdeck";

export default async function ActivityPage() {
  const session = await requireAdminSession({ returnTo: "/admin/activity" });
  if (!isAdmin(principal(session))) redirect("/admin");

  const content = await payloadContent();
  const loadActivity = createAdminPayloadActivityLoader({ content });
  const events = await loadActivity({});

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Activity" />
      <p className="max-w-prose text-sm text-zinc-600">
        Recent changes across Payload collections, recorded as audit events.
      </p>
      <AdminSectionCard icon={Activity} title="Recent activity">
        <AdminActivityPage events={events} />
      </AdminSectionCard>
    </div>
  );
}

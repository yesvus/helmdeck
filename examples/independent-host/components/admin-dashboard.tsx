"use client";

import { AdminMediaUpload, AdminPageHeader } from "@yesvus/helmdeck";
import { ExampleProfileForm } from "@/components/profile-form";
import { mediaAdapter } from "@/host/media";

export function AdminDashboard() {
  return <>
    <AdminPageHeader title="Workspace profile" />
    <p className="mb-6 text-sm text-zinc-600">A representative host-owned form and media integration.</p>
    <div className="grid gap-8 lg:grid-cols-2">
      <ExampleProfileForm />
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Media</h2>
        <p className="text-sm text-zinc-600">Replace this adapter with the host storage service.</p>
        <AdminMediaUpload adapter={mediaAdapter} />
      </section>
    </div>
  </>;
}

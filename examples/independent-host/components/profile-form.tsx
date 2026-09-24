"use client";

import { Suspense } from "react";
import { AdminField, AdminInput, AdminManagedForm, Button } from "@yesvus/helmdeck";
import { saveProfile } from "@/host/actions";

export function ExampleProfileForm() {
  return <section className="space-y-3">
    <h2 className="text-lg font-semibold">Profile</h2>
    <Suspense fallback={<p>Loading profile form…</p>}>
      <AdminManagedForm action={saveProfile} className="space-y-4">
        <AdminField label="Display name">
          <AdminInput name="name" defaultValue="Sample editor" required />
        </AdminField>
        <Button type="submit">Save profile</Button>
      </AdminManagedForm>
    </Suspense>
  </section>;
}

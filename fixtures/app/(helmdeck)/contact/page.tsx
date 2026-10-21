// SPDX-License-Identifier: MIT

import { AdminContactForm, AdminPageHeader, AdminSurfaceCard } from "@yesvus/helmdeck";
import { submitContactMessage } from "./actions";

export default function ContactPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-12">
      <AdminPageHeader title="Contact us" />
      <AdminSurfaceCard>
        <div className="p-6">
          <AdminContactForm onSubmit={submitContactMessage} />
        </div>
      </AdminSurfaceCard>
    </main>
  );
}

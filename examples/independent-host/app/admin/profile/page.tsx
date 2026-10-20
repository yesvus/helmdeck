"use client";

import { useAdminSession } from "@yesvus/helmdeck";

export default function ProfilePage() {
  const { session } = useAdminSession();
  return (
    <section className="max-w-xl rounded-xl border bg-white p-6">
      <h1 className="text-xl font-semibold">Profile</h1>
      <dl className="mt-4 grid gap-2">
        <dt className="font-medium">Name</dt>
        <dd>{session?.name}</dd>
        <dt className="font-medium">Email</dt>
        <dd>{session?.email}</dd>
        <dt className="font-medium">Role</dt>
        <dd>{session?.role}</dd>
      </dl>
    </section>
  );
}

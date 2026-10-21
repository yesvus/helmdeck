"use client";

import { AdminProfilePage, useAdminSession } from "@yesvus/helmdeck";

export default function ProfilePage() {
  const { session, logout } = useAdminSession();
  if (!session) return null;
  return <AdminProfilePage session={session} onSignOut={logout} />;
}

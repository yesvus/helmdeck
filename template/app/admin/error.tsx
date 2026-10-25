"use client";

import { AdminErrorBoundary } from "@yesvus/helmdeck";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <AdminErrorBoundary
      error={error}
      reset={reset}
      title="Bir şeyler ters gitti"
      description="Sayfa yüklenirken bir hata oluştu. Lütfen sayfayı yenileyin."
      reloadLabel="Sayfayı yenile"
    />
  );
}

// SPDX-License-Identifier: MIT

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { archiveFeedback } from "@/lib/payload/feedback-actions";

export function ArchiveButton({ id }: { id: string }) {
  const router = useRouter();
  const [error, setError] = useState(false);
  return <div><button className="rounded border px-3 py-2 text-sm" onClick={async () => { setError(false); try { await archiveFeedback(id); router.push("/admin/inbox"); } catch { setError(true); } }}>Archive</button>{error ? <p role="alert" className="mt-2 text-sm text-admin-danger-text">Could not archive this message.</p> : null}</div>;
}

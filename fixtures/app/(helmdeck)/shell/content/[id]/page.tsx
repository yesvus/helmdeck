// SPDX-License-Identifier: MIT
"use client";

import { use, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AdminResourceForm } from "@yesvus/helmdeck";
import { contentPosts } from "../content-registry";
import { contentPersistence } from "../content-persistence";

/**
 * One post, addressed by the id the list linked to.
 *
 * Back to the list once it is saved, because the list is where a saved change is visible: the form
 * still holds what was typed, and only a fresh read proves the store took it.
 */
export default function PostDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const onSaved = useCallback(() => {
    router.push("/shell/content");
  }, [router]);

  return (
    <AdminResourceForm
      definition={contentPosts}
      persistence={contentPersistence}
      id={id}
      backHref="/shell/content"
      onSaved={onSaved}
    />
  );
}

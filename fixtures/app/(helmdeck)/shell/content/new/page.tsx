// SPDX-License-Identifier: MIT
"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { AdminResourceForm } from "@yesvus/helmdeck";
import { contentPosts } from "../content-registry";
import { contentPersistence } from "../content-persistence";

/** A new post, on the form the definition generates, back to the list once it is saved. */
export default function NewPostPage() {
  const router = useRouter();
  const onSaved = useCallback(() => {
    router.push("/shell/content");
  }, [router]);

  return (
    <AdminResourceForm
      definition={contentPosts}
      persistence={contentPersistence}
      backHref="/shell/content"
      onSaved={onSaved}
    />
  );
}

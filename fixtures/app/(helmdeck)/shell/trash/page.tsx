// SPDX-License-Identifier: MIT
"use client";

import { useState } from "react";
import { AdminTrashPage, type AdminTrashItem } from "@yesvus/helmdeck";

const initialItems: AdminTrashItem[] = [
  { id: "post-archived-1", resource: "posts", label: "Spring collection", deletedAt: "2026-10-19T12:00:00.000Z", deletedBy: "Ada Lovelace" },
  { id: "product-archived-1", resource: "products", label: "Retired table lamp", deletedAt: "2026-10-18T09:15:00.000Z", deletedBy: "Grace Hopper" },
];

export default function TrashPage() {
  const [items, setItems] = useState(initialItems);

  function remove(ids: readonly string[]) {
    const removed = new Set(ids);
    setItems((current) => current.filter((item) => !removed.has(item.id)));
  }

  return (
    <AdminTrashPage
      items={items}
      onRestore={(item) => remove([item.id])}
      onPurge={(item) => remove([item.id])}
      onRestoreMany={(selected) => remove(selected.map((item) => item.id))}
      onPurgeMany={(selected) => remove(selected.map((item) => item.id))}
    />
  );
}

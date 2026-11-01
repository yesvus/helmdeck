import type { AdminNavGroup } from "@yesvus/helmdeck";

export function commerceNav(configured: boolean): AdminNavGroup[] {
  return configured ? [{ label: "Commerce", items: [{ href: "/commerce", label: "Products", icon: "article" }] }] : [];
}

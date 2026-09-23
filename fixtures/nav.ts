import type { AdminNavGroup, AdminSession } from "../src";

export const sampleNav: AdminNavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/shell", label: "Dashboard", shortLabel: "Home", icon: "overview", mobilePrimary: true },
      { href: "/shell/analytics", label: "Analytics", shortLabel: "Stats", icon: "chart" },
    ],
  },
  {
    label: "Content",
    items: [
      {
        href: "/shell/products",
        label: "Products",
        shortLabel: "Products",
        icon: "product",
        mobilePrimary: true,
        keywords: ["catalog", "inventory", "sku"],
      },
      { href: "/shell/media", label: "Media library", shortLabel: "Media", icon: "media", mobilePrimary: true },
      { href: "/shell/orders", label: "Orders", shortLabel: "Orders", icon: "file", roles: ["admin"] },
    ],
  },
  {
    label: "Settings",
    items: [
      { href: "/shell/settings/site", label: "Site settings", shortLabel: "Site", icon: "settings", roles: ["admin"] },
    ],
  },
];

export const sampleSearchEntries = [
  {
    href: "/shell/orders",
    label: "Refund an order",
    group: "Guides",
    terms: "payment chargeback invoice",
  },
];

export const sampleSession: AdminSession = {
  email: "editor@demo.test",
  name: "Demo Editor",
  role: "editor",
};

import type { AdminNavGroup } from "@yesvus/helmdeck";

export const sampleNav: AdminNavGroup[] = [
  {
    label: "Overview",
    icon: "overview",
    items: [
      { href: "/shell", label: "Dashboard", shortLabel: "Home", icon: "overview", mobilePrimary: true },
      { href: "/shell/analytics", label: "Analytics", shortLabel: "Stats", icon: "chart" },
        // The engine dashboard, inside the shell. It was built at /dashboard and reachable only by
        // typing the URL, which is the same failure #130 is about: a feature that exists and that a
        // visitor never sees.
        { href: "/dashboard", label: "Engine dashboard", shortLabel: "Engine", icon: "chart" },
    ],
  },
  {
    label: "Content",
    icon: "folder",
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
      {
        // The collection engine and its editor, driving rows that are really stored. Without an entry
        // here the editor is reachable only by typing its URL, which is the same failure the engine
        // dashboard entry above was added to fix.
        href: "/shell/pages",
        label: "Landing page",
        shortLabel: "Landing",
        icon: "sparkles",
        keywords: ["sections", "arrangement", "collection", "reorder"],
      },
    ],
  },
  {
    label: "Settings",
    icon: "settings",
    items: [
      { href: "/shell/profile", label: "Profile", shortLabel: "Profile", icon: "users" },
      { href: "/shell/settings/site", label: "Site settings", shortLabel: "Site", icon: "settings" },
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


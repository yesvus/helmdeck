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
      {
        // The two resources that reference each other, which is what the reference work made
        // possible: a shipment's customer is a row the store holds, offered by the generated form
        // and checked on the way in, rather than a column a host writes by hand.
        href: "/shell/customers",
        label: "Customers",
        shortLabel: "Customers",
        icon: "users",
        keywords: ["people", "accounts", "contacts", "who"],
      },
      {
        href: "/shell/shipments",
        label: "Shipments",
        shortLabel: "Shipments",
        icon: "store",
        keywords: ["delivery", "dispatch", "tracking", "orders in transit"],
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
    // The CMS. Its three surfaces read and write the same posts, and each was unreachable by anything
    // but a typed URL until now, which is the failure the engine dashboard entry above was added for.
    label: "Writing",
    icon: "article",
    items: [
      {
        href: "/shell/content",
        label: "Content",
        shortLabel: "Content",
        icon: "article",
        keywords: ["posts", "draft", "published", "edit"],
      },
      {
        // The door into Payload. helmdeck's shell keeps the dashboard, the charts and the CRUD over the
        // demo's own tables; content editing is Payload's, and this is the link that says so rather than
        // a second content editor competing with the first.
        href: "/shell/studio",
        label: "Content studio",
        shortLabel: "Studio",
        icon: "sparkles",
        keywords: ["payload", "rich text", "lexical", "blocks", "versions", "cms"],
      },
      {
        href: "/shell/revisions",
        label: "History",
        shortLabel: "History",
        icon: "clock",
        keywords: ["revisions", "restore", "versions", "undo", "what did it say"],
      },
      {
        href: "/shell/schedule",
        label: "Schedule",
        shortLabel: "Schedule",
        icon: "calendar",
        keywords: ["publish", "queued", "later", "go live"],
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
  {
    // The package itself, and the shape of this demo. Outside the shell because neither is part of an
    // operator's work: one is what a host installs, the other is what this site is made of.
    label: "The framework",
    icon: "wrench",
    items: [
      {
        href: "/catalog",
        label: "Component catalogue",
        shortLabel: "Catalogue",
        icon: "wrench",
        keywords: ["components", "exports", "reference", "api", "what does it ship"],
      },
      {
        href: "/dashboard/arrange",
        label: "Arrange this dashboard",
        shortLabel: "Arrange",
        icon: "activity",
        keywords: ["dashboard", "tiles", "layout", "order", "engine"],
      },
      {
        // The tiles the package ships, over the demo's real rows. This is the surface that answers
        // "what does installing this actually get me", so it sits beside the engine dashboard rather
        // than behind a menu.
        href: "/dashboard/tiles",
        label: "Shipped tiles",
        shortLabel: "Tiles",
        icon: "chart",
        keywords: ["tiles", "widgets", "stat", "chart", "activity", "revenue", "stock"],
      },
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


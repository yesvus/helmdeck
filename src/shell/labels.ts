export type AdminShellLabels = {
  sidebarExpand: string;
  sidebarCollapse: string;
  brandLabel: string;
  searchLabel: string;
  searchPlaceholder: string;
  searchHint: string;
  searchNoResults: string;
  mobileMore: string;
  breadcrumbLabel: string;
  segmentNew: string;
  profileMenu: string;
  profile: string;
  viewSite: string;
  signOut: string;
  loginEmail: string;
  loginPassword: string;
  loginSubmit: string;
  loginBack: string;
};

export const defaultAdminLabels: AdminShellLabels = {
  sidebarExpand: "Expand sidebar",
  sidebarCollapse: "Collapse sidebar",
  brandLabel: "Admin",
  searchLabel: "Search admin pages",
  searchPlaceholder: "Search pages and settings",
  searchHint: "Search (Ctrl/⌘ K)",
  searchNoResults: "No matching pages or settings.",
  mobileMore: "More",
  breadcrumbLabel: "Breadcrumb",
  segmentNew: "New",
  profileMenu: "Profile menu",
  profile: "Profile",
  viewSite: "View site",
  signOut: "Sign out",
  loginEmail: "Email",
  loginPassword: "Password",
  loginSubmit: "Sign in",
  loginBack: "Back to site",
};

export function mergeAdminLabels(labels?: Partial<AdminShellLabels>): AdminShellLabels {
  return { ...defaultAdminLabels, ...labels };
}

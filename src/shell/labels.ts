// SPDX-License-Identifier: MIT
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
  authChecking: string;
  authRedirecting: string;
  authSignInLink: string;
  authSessionError: string;
  profileIdentity: string;
  profileName: string;
  profileEmail: string;
  profileRole: string;
  profileSessions: string;
  profileSessionsDescription: string;
  profileNoOtherSessions: string;
  profileSessionStarted: string;
  signOutEverywhere: string;
  settings: string;
  settingsDescription: string;
  settingsOpen: string;
  permissionDenied: string;
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
  authChecking: "Checking your session.",
  authRedirecting: "You need to sign in to view this page.",
  authSignInLink: "Go to sign in",
  authSessionError: "Your session could not be checked. Try again.",
  profileIdentity: "Identity",
  profileName: "Name",
  profileEmail: "Email",
  profileRole: "Role",
  profileSessions: "Signed-in sessions",
  profileSessionsDescription: "Devices currently signed in to this account.",
  profileNoOtherSessions: "No other sessions.",
  profileSessionStarted: "Started",
  signOutEverywhere: "Sign out everywhere",
  settings: "Settings",
  settingsDescription: "Preferences for this account.",
  settingsOpen: "Open settings",
  permissionDenied: "You do not have access to this.",
};

export function mergeAdminLabels(labels?: Partial<AdminShellLabels>): AdminShellLabels {
  return { ...defaultAdminLabels, ...labels };
}

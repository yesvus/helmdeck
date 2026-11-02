import { AdminSettingsPage } from "@yesvus/helmdeck";

/**
 * A ready-made settings page, so a host does not have to build one to surface Helmdeck's version
 * and language preference. Sections are passed in by the host; this page supplies the frame.
 */
export default function AdminSettingsRoute() {
  return <AdminSettingsPage />;
}

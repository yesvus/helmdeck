import { AdminPageHeader } from "@yesvus/helmdeck";
import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/guard";
import { principal, isAdmin } from "@/lib/rules";
import { listPages } from "@/lib/payload/content";
import { listNavigationItems } from "@/lib/navigation-actions";
import { NavigationEditor } from "@/components/navigation-editor";

export default async function NavigationPage() {
  const session = await requireAdminSession({ returnTo: "/admin/navigation" });
  if (!isAdmin(principal(session))) redirect("/admin");
  const [items, pages] = await Promise.all([listNavigationItems(), listPages()]);
  return (
    <div className="space-y-6">
      <AdminPageHeader title="Navigation" />
      <p className="max-w-prose text-sm text-zinc-600">Ordered site navigation links rendered on public pages.</p>
      <NavigationEditor initialItems={items} pages={pages} />
    </div>
  );
}

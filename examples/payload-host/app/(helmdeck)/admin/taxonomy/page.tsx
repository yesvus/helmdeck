import { AdminPageHeader } from "@yesvus/helmdeck";
import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/guard";
import { principal, isAdmin } from "@/lib/rules";
import { listTerms } from "@/lib/navigation-actions";
import { TaxonomyEditor } from "@/components/taxonomy-editor";

export default async function TaxonomyPage() {
  const session = await requireAdminSession({ returnTo: "/admin/taxonomy" });
  if (!isAdmin(principal(session))) redirect("/admin");
  const [categories, tags] = await Promise.all([listTerms("categories"), listTerms("tags")]);
  return (
    <div className="space-y-6">
      <AdminPageHeader title="Taxonomy" />
      <p className="max-w-prose text-sm text-zinc-600">Categories and tags used across content.</p>
      <TaxonomyEditor categories={categories} tags={tags} />
    </div>
  );
}

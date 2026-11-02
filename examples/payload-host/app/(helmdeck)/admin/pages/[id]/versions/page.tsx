import Link from "next/link";
import { AdminPageHeader } from "@yesvus/helmdeck";
import { PageVersions } from "@/components/page-versions";
import { listPageVersionDocs } from "@/lib/payload/content";
import { readPayloadSession } from "@/lib/session";
import { can, principal } from "@/lib/rules";

export default async function PageVersionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [versions, session] = await Promise.all([listPageVersionDocs(id), readPayloadSession()]);
  const canRestore = can(principal(session), "update");

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Page versions" action={<Link href="/admin/pages" className="text-sm font-semibold text-brand-700 hover:underline">Back to pages</Link>} />
      <p className="max-w-prose text-sm text-zinc-600">
        Prior versions of this page in Payload. Restore puts a chosen version back.
      </p>
      <PageVersions versions={versions} canRestore={canRestore} />
    </div>
  );
}

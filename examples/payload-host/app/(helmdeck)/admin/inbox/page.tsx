import { InboxClient } from "./inbox-client";
import { listFeedback } from "@/lib/payload/feedback-actions";

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const requestedPage = Number((await searchParams).page ?? "1");
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const result = await listFeedback(page);
  const messages = result.docs.map((doc) => ({
    id: String(doc.id), sender: String(doc.name), subject: String(doc.subject), preview: String(doc.message).slice(0, 160),
    receivedAt: String(doc.submitted_at), status: doc.status === "archived" ? "archived" as const : doc.status === "read" ? "read" as const : "unread" as const,
  }));
  return <main className="space-y-6"><h1 className="text-2xl font-semibold">Feedback inbox</h1><InboxClient messages={messages} page={result.page ?? page} pageCount={result.totalPages ?? 1} /></main>;
}

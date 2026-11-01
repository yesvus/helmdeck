import { notFound } from "next/navigation";
import { AdminInboxMessage, type AdminInboxMessageData } from "@yesvus/helmdeck";
import { readFeedback } from "@/lib/payload/feedback-actions";
import { ArchiveButton } from "../archive-button";
import { NotFound } from "payload";

export default async function FeedbackDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let record;
  try {
    record = await readFeedback(id);
  } catch (error) { if (error instanceof NotFound) notFound(); throw error; }
  const message: AdminInboxMessageData = { id, sender: String(record.name), subject: String(record.subject), preview: String(record.message).slice(0, 160), body: String(record.message), receivedAt: String(record.submitted_at), status: record.status === "archived" ? "archived" : record.status === "read" ? "read" : "unread" };
  return <main className="space-y-5"><AdminInboxMessage message={message} /><ArchiveButton id={id} /></main>;
}

// SPDX-License-Identifier: MIT
"use client";

import { useState } from "react";
import { Button } from "./button.js";

export interface HelmdeckErrorAdapter {
  captureException: (error: unknown, context?: Record<string, unknown>) => string | void;
  showReportDialog?: (options?: { eventId?: string }) => void;
}

export type AdminErrorViewLabels = {
  title: string;
  retry: string;
  returnHome: string;
  copy: string;
  copied: string;
  reportIssue: string;
  showDetails: string;
  hideDetails: string;
};

export const defaultAdminErrorViewLabels: AdminErrorViewLabels = {
  title: "Something went wrong",
  retry: "Retry",
  returnHome: "Return to admin home",
  copy: "Copy Diagnostic Report",
  copied: "Copied",
  reportIssue: "Report Issue",
  showDetails: "Show technical details",
  hideDetails: "Hide technical details",
};

export async function copyDiagnosticReport(report: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(report);
      return true;
    }
    if (typeof document === "undefined" || !document.body) return false;
    const field = document.createElement("textarea");
    field.value = report;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();
    const copied = typeof document.execCommand === "function" && document.execCommand("copy");
    document.body.removeChild(field);
    return copied;
  } catch {
    return false;
  }
}

export function AdminErrorView({
  error, digest, componentStack, reset, eventId, showReportDialog, homeHref = "/admin", labels,
}: {
  error?: unknown;
  digest?: string;
  componentStack?: string;
  reset?: () => void;
  eventId?: string;
  showReportDialog?: HelmdeckErrorAdapter["showReportDialog"];
  homeHref?: string;
  labels?: Partial<AdminErrorViewLabels>;
}) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const copy = { ...defaultAdminErrorViewLabels, ...labels };
  const exception = error instanceof Error ? error : new Error(String(error ?? "Unknown error"));
  const timestamp = new Date().toISOString();
  const stack = [exception.stack, componentStack].filter(Boolean).join("\n\n");
  const report = `# Diagnostic Report\n\n- Name: ${exception.name}\n- Message: ${exception.message}\n- Digest: ${digest ?? "Not provided"}\n- Timestamp: ${timestamp}\n\n## Stack\n\n\`\`\`\n${stack || "Not available"}\n\`\`\``;
  const copyReport = async () => setCopied(await copyDiagnosticReport(report));

  return (
    <section role="alert" className="mx-auto w-full max-w-3xl rounded-admin-card border border-admin-border bg-admin-surface p-6 text-admin-text-primary shadow-sm">
      <h1 className="text-xl font-semibold">{copy.title}</h1>
      <p className="mt-2 font-semibold">{exception.name}</p>
      <p className="mt-1 break-words text-sm text-zinc-600">{exception.message}</p>
      {digest ? <p className="mt-2 font-mono text-xs text-zinc-600">Digest: {digest}</p> : null}
      <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)} className="mt-5 rounded-admin-card border border-admin-border bg-admin-surface-subtle p-4">
        <summary className="cursor-pointer text-sm font-medium">{open ? copy.hideDetails : copy.showDetails}</summary>
        <p className="mt-2 text-xs text-zinc-600">{timestamp}</p>
        <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-admin-card bg-admin-surface-muted p-3 text-xs">{stack || "Not available"}</pre>
      </details>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button type="button" onClick={reset}>{copy.retry}</Button>
        <Button type="button" variant="outline" onClick={() => { if (typeof window !== "undefined") window.location.assign(homeHref); }}>{copy.returnHome}</Button>
        <Button type="button" variant="outline" onClick={copyReport}>{copied ? copy.copied : copy.copy}</Button>
        {showReportDialog ? <Button type="button" variant="outline" onClick={() => showReportDialog({ eventId })}>{copy.reportIssue}</Button> : null}
      </div>
    </section>
  );
}

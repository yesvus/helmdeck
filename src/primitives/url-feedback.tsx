// SPDX-License-Identifier: MIT
"use client";

import { AlertCircle, CheckCircle2, Link2 } from "lucide-react";
import { useCallback, useEffect, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation.js";
import { AdminToastCard, AdminToastViewport } from "./toast.js";
import { useAdminMessages } from "../i18n.js";

export type AdminUrlFeedbackLabels = {
  successTitle: string;
  errorTitle: string;
  assetTitle: string;
};

export type AdminUrlFeedbackQueryKeys = {
  message: string;
  status: string;
  feedback: string;
  assetUrl: string;
};

const defaultAdminUrlFeedbackQueryKeys: AdminUrlFeedbackQueryKeys = {
  message: "message",
  status: "status",
  feedback: "feedback",
  assetUrl: "assetUrl",
};

export function AdminUrlFeedback({
  durationMs = 3200,
  labels,
  message,
  assetUrl,
  queryKeys = defaultAdminUrlFeedbackQueryKeys,
}: {
  durationMs?: number;
  labels?: Partial<AdminUrlFeedbackLabels>;
  message?: string;
  assetUrl?: string;
  queryKeys?: Partial<AdminUrlFeedbackQueryKeys>;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const resolvedQueryKeys = useMemo(
    () => ({ ...defaultAdminUrlFeedbackQueryKeys, ...queryKeys }),
    [queryKeys],
  );
  const i18n = useAdminMessages();
  const mergedLabels = {
    successTitle: i18n.form.successTitle,
    errorTitle: i18n.form.errorTitle,
    assetTitle: i18n.form.assetTitle,
    ...labels,
  };
  const feedbackKey = searchParams.get(resolvedQueryKeys.feedback) ?? "";
  const isError = searchParams.get(resolvedQueryKeys.status) === "error";
  const activeMessage = message ?? searchParams.get(resolvedQueryKeys.message) ?? undefined;
  const activeAssetUrl = assetUrl ?? searchParams.get(resolvedQueryKeys.assetUrl) ?? undefined;

  const clearFeedback = useCallback(() => {
    const nextParams = new URLSearchParams(searchParams.toString());
    Object.values(resolvedQueryKeys).forEach((key) => nextParams.delete(key));
    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  }, [pathname, resolvedQueryKeys, router, searchParams]);

  useEffect(() => {
    if (!activeMessage && !activeAssetUrl) {
      return;
    }

    const timeoutId = window.setTimeout(clearFeedback, durationMs);
    return () => window.clearTimeout(timeoutId);
  }, [activeAssetUrl, activeMessage, clearFeedback, durationMs, feedbackKey]);

  if (!activeMessage && !activeAssetUrl) {
    return null;
  }

  return (
    <AdminToastViewport key={`${feedbackKey}:${activeMessage ?? ""}:${activeAssetUrl ?? ""}`}>
      {activeMessage ? (
        <AdminToastCard
          tone={isError ? "error" : "success"}
          title={isError ? mergedLabels.errorTitle : mergedLabels.successTitle}
          body={activeMessage}
          icon={isError ? <AlertCircle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
          onClose={clearFeedback}
        />
      ) : null}
      {activeAssetUrl ? (
        <AdminToastCard
          tone="info"
          title={mergedLabels.assetTitle}
          body={activeAssetUrl}
          icon={<Link2 className="h-5 w-5" />}
          onClose={clearFeedback}
        />
      ) : null}
    </AdminToastViewport>
  );
}

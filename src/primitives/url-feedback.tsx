// SPDX-License-Identifier: MIT
"use client";

import { AlertCircle, CheckCircle2, Link2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation.js";
import type { AdminSearchParams } from "./use-admin-search-params.js";
import { useAdminSearchParams } from "./use-admin-search-params.js";
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

type AdminUrlFeedbackProps = {
  durationMs?: number;
  labels?: Partial<AdminUrlFeedbackLabels>;
  message?: string;
  assetUrl?: string;
  status?: "success" | "error";
  queryKeys?: Partial<AdminUrlFeedbackQueryKeys>;
};

/**
 * Shows a message after a redirect by reading the query string.
 *
 * When the page is statically generated this needs a `<Suspense>` boundary, because the
 * query path reads search params. Supplying both `message` and `assetUrl` takes a path
 * that reads nothing from the URL, so the boundary is not needed there. That path also
 * needs `status` to render anything other than a success tone, since the tone otherwise
 * comes from the query string.
 */
export function AdminUrlFeedback(props: AdminUrlFeedbackProps) {
  if (props.message !== undefined && props.assetUrl !== undefined) {
    return (
      <AdminUrlFeedbackToast
        durationMs={props.durationMs}
        labels={props.labels}
        message={props.message}
        assetUrl={props.assetUrl}
        status={props.status}
        searchParams={null}
        onDismiss={null}
      />
    );
  }

  return <AdminUrlFeedbackFromQuery {...props} />;
}

function AdminUrlFeedbackFromQuery({
  durationMs = 3200,
  labels,
  message,
  assetUrl,
  status,
  queryKeys = defaultAdminUrlFeedbackQueryKeys,
}: AdminUrlFeedbackProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useAdminSearchParams("AdminUrlFeedback");
  const resolvedQueryKeys = useMemo(
    () => ({ ...defaultAdminUrlFeedbackQueryKeys, ...queryKeys }),
    [queryKeys],
  );

  const clearFeedback = useCallback(() => {
    const nextParams = new URLSearchParams(searchParams.toString());
    Object.values(resolvedQueryKeys).forEach((key) => nextParams.delete(key));
    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  }, [pathname, resolvedQueryKeys, router, searchParams]);

  return (
    <AdminUrlFeedbackToast
      durationMs={durationMs}
      labels={labels}
      message={message}
      assetUrl={assetUrl}
      status={status}
      searchParams={searchParams}
      queryKeys={resolvedQueryKeys}
      onDismiss={clearFeedback}
    />
  );
}

function AdminUrlFeedbackToast({
  durationMs = 3200,
  labels,
  message,
  assetUrl,
  status,
  searchParams,
  queryKeys = defaultAdminUrlFeedbackQueryKeys,
  onDismiss,
}: AdminUrlFeedbackProps & {
  searchParams: AdminSearchParams | null;
  queryKeys?: AdminUrlFeedbackQueryKeys;
  onDismiss: (() => void) | null;
}) {
  const i18n = useAdminMessages();
  const mergedLabels = {
    successTitle: i18n.form.successTitle,
    errorTitle: i18n.form.errorTitle,
    assetTitle: i18n.form.assetTitle,
    ...labels,
  };
  const [dismissedSignature, setDismissedSignature] = useState<string | null>(null);
  const feedbackKey = searchParams?.get(queryKeys.feedback) ?? "";
  const isError = (status ?? searchParams?.get(queryKeys.status)) === "error";
  const activeMessage = message ?? searchParams?.get(queryKeys.message) ?? undefined;
  const activeAssetUrl = assetUrl ?? searchParams?.get(queryKeys.assetUrl) ?? undefined;
  // Signed on the pre-dismiss values, so dismissing cannot clear its own signature and
  // the toast cannot reappear. JSON keeps the fields unambiguous even if one contains the
  // separator.
  const feedbackSignature = JSON.stringify([feedbackKey, activeMessage ?? "", activeAssetUrl ?? ""]);
  const dismissed = dismissedSignature === feedbackSignature;
  const visibleMessage = dismissed ? undefined : activeMessage;
  const visibleAssetUrl = dismissed ? undefined : activeAssetUrl;

  const dismiss = useCallback(() => {
    if (onDismiss) {
      onDismiss();
      return;
    }
    setDismissedSignature(feedbackSignature);
  }, [feedbackSignature, onDismiss]);

  // New content is a render-time fact, so the stale signature is dropped in the same pass
  // instead of after a commit that would render nothing.
  if (dismissedSignature !== null && dismissedSignature !== feedbackSignature) {
    setDismissedSignature(null);
  }

  useEffect(() => {
    if (!visibleMessage && !visibleAssetUrl) {
      return;
    }

    const timeoutId = window.setTimeout(dismiss, durationMs);
    return () => window.clearTimeout(timeoutId);
  }, [dismiss, durationMs, visibleAssetUrl, visibleMessage]);

  if (!visibleMessage && !visibleAssetUrl) {
    return null;
  }

  return (
    <AdminToastViewport key={`${feedbackKey}:${visibleMessage ?? ""}:${visibleAssetUrl ?? ""}`}>
      {visibleMessage ? (
        <AdminToastCard
          tone={isError ? "error" : "success"}
          title={isError ? mergedLabels.errorTitle : mergedLabels.successTitle}
          body={visibleMessage}
          icon={isError ? <AlertCircle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
          onClose={dismiss}
        />
      ) : null}
      {visibleAssetUrl ? (
        <AdminToastCard
          tone="info"
          title={mergedLabels.assetTitle}
          body={visibleAssetUrl}
          icon={<Link2 className="h-5 w-5" />}
          onClose={dismiss}
        />
      ) : null}
    </AdminToastViewport>
  );
}

// SPDX-License-Identifier: MIT
"use client";

import {
  createContext,
  useActionState,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AdminToastCard, AdminToastViewport } from "./toast.js";
import {
  defaultAdminManagedFormFeedbackLabels,
  type AdminManagedFormFeedbackLabels,
} from "./messages.js";
import { useAdminMessages } from "../i18n.js";

export type AdminFormActionState = {
  status: "idle" | "success" | "error";
  message: string;
  feedbackKey: string;
  redirectTo?: string;
};

export const ADMIN_FORM_ACTION_IDLE_STATE: AdminFormActionState = {
  status: "idle",
  message: "",
  feedbackKey: "",
};

export const ADMIN_FORM_VALUE_EVENT = "admin-form-value-change";

type AdminFormDirtyContextValue = boolean | undefined;
const AdminFormDirtyContext = createContext<AdminFormDirtyContextValue>(undefined);

export type AdminManagedFormAutosaveContext = {
  pathname: string;
  searchParams: URLSearchParams;
};

function serializeFormValue(value: FormDataEntryValue) {
  if (value instanceof File) {
    return {
      kind: "file",
      name: value.name,
      size: value.size,
      type: value.type,
      lastModified: value.lastModified,
    };
  }

  return value;
}

function buildFormSignature(form: HTMLFormElement) {
  return JSON.stringify(
    Array.from(new FormData(form).entries()).map(([key, value]) => [
      key,
      serializeFormValue(value),
    ]),
  );
}

function restoreAutosavedFields(form: HTMLFormElement, serialized: string) {
  const entries = JSON.parse(serialized) as [string, string][];

  for (const [name, value] of entries) {
    const controls = Array.from(form.elements).filter(
      (element): element is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement =>
        (element instanceof HTMLInputElement ||
          element instanceof HTMLTextAreaElement ||
          element instanceof HTMLSelectElement) &&
        element.name === name &&
        element.type !== "file",
    );

    for (const control of controls) {
      if (control instanceof HTMLInputElement && (control.type === "checkbox" || control.type === "radio")) {
        control.checked = control.value === value || value === "on";
      } else {
        control.value = value;
      }
      control.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }
}

export function AdminManagedForm({
  action,
  autosaveKey,
  autosaveStoragePrefix = "helmdeck:admin-autosave",
  children,
  className,
  feedbackDurationMs = 3200,
  feedbackLabels,
}: {
  action: (
    state: AdminFormActionState,
    formData: FormData,
  ) => Promise<AdminFormActionState>;
  autosaveKey?: (context: AdminManagedFormAutosaveContext) => string | null;
  autosaveStoragePrefix?: string;
  children: ReactNode;
  className?: string;
  feedbackDurationMs?: number;
  feedbackLabels?: Partial<AdminManagedFormFeedbackLabels>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const resolvedAutosaveKey = autosaveKey?.({ pathname, searchParams }) ?? null;
  const autosaveStorageKey = resolvedAutosaveKey
    ? `${autosaveStoragePrefix}:${resolvedAutosaveKey}`
    : null;
  const i18n = useAdminMessages();
  const mergedFeedbackLabels = {
    ...defaultAdminManagedFormFeedbackLabels,
    ...i18n.form,
    ...feedbackLabels,
  };
  const formRef = useRef<HTMLFormElement | null>(null);
  const baselineRef = useRef<string | null>(null);
  const frameRef = useRef<number | null>(null);
  const autosaveTimerRef = useRef<number | null>(null);
  const handledFeedbackRef = useRef("");
  const [isDirty, setIsDirty] = useState(false);
  const [feedbackState, setFeedbackState] = useState(ADMIN_FORM_ACTION_IDLE_STATE);
  const [submissionState, formAction] = useActionState(action, ADMIN_FORM_ACTION_IDLE_STATE);

  const syncDirtyState = useCallback(() => {
    const form = formRef.current;
    if (!form) {
      return;
    }

    const nextSignature = buildFormSignature(form);
    const baselineSignature = baselineRef.current ?? nextSignature;
    baselineRef.current = baselineSignature;
    setIsDirty(nextSignature !== baselineSignature);
  }, []);

  const scheduleSync = useCallback(() => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
    }

    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      syncDirtyState();
    });
  }, [syncDirtyState]);

  useEffect(() => {
    const form = formRef.current;
    if (!form) {
      return;
    }

    const handleCustomValueChange = () => scheduleSync();
    form.addEventListener(ADMIN_FORM_VALUE_EVENT, handleCustomValueChange);
    return () => form.removeEventListener(ADMIN_FORM_VALUE_EVENT, handleCustomValueChange);
  }, [scheduleSync]);

  useEffect(() => {
    if (
      submissionState.status === "idle" ||
      !submissionState.feedbackKey ||
      handledFeedbackRef.current === submissionState.feedbackKey
    ) {
      return;
    }

    handledFeedbackRef.current = submissionState.feedbackKey;

    if (submissionState.status === "success") {
      const form = formRef.current;
      if (form) {
        baselineRef.current = buildFormSignature(form);
      }
      scheduleSync();
      if (autosaveStorageKey) {
        window.localStorage.removeItem(autosaveStorageKey);
      }
    }

    if (submissionState.redirectTo) {
      router.replace(submissionState.redirectTo);
      return;
    }

    window.requestAnimationFrame(() => setFeedbackState(submissionState));
  }, [autosaveStorageKey, router, scheduleSync, submissionState]);

  useEffect(() => {
    const form = formRef.current;
    if (!form || !autosaveStorageKey) {
      return;
    }

    const saved = window.localStorage.getItem(autosaveStorageKey);
    if (!saved) {
      return;
    }

    try {
      restoreAutosavedFields(form, saved);
      scheduleSync();
    } catch {
      window.localStorage.removeItem(autosaveStorageKey);
    }
  }, [autosaveStorageKey, scheduleSync]);

  useEffect(() => {
    if (feedbackState.status === "idle" || !feedbackState.feedbackKey) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setFeedbackState(ADMIN_FORM_ACTION_IDLE_STATE);
    }, feedbackDurationMs);

    return () => window.clearTimeout(timeoutId);
  }, [feedbackDurationMs, feedbackState]);

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
      if (autosaveTimerRef.current !== null) {
        window.clearTimeout(autosaveTimerRef.current);
      }
    };
  }, []);

  return (
    <AdminFormDirtyContext.Provider value={isDirty}>
      <form
        ref={(node) => {
          formRef.current = node;
          if (node && baselineRef.current === null) {
            baselineRef.current = buildFormSignature(node);
          }
        }}
        action={formAction}
        className={className}
        onInputCapture={scheduleSync}
        onChangeCapture={() => {
          scheduleSync();
          if (!autosaveStorageKey) {
            return;
          }
          if (autosaveTimerRef.current !== null) {
            window.clearTimeout(autosaveTimerRef.current);
          }
          autosaveTimerRef.current = window.setTimeout(() => {
            const form = formRef.current;
            if (!form) {
              return;
            }
            const entries = Array.from(new FormData(form).entries())
              .filter((entry): entry is [string, string] => typeof entry[1] === "string");
            window.localStorage.setItem(autosaveStorageKey, JSON.stringify(entries));
          }, 1200);
        }}
        onClickCapture={scheduleSync}
        onResetCapture={() => {
          const form = formRef.current;
          baselineRef.current = form ? buildFormSignature(form) : null;
          setIsDirty(false);
        }}
      >
        {children}
      </form>
      {feedbackState.status !== "idle" && feedbackState.message ? (
        <AdminToastViewport>
          <AdminToastCard
            tone={feedbackState.status === "error" ? "error" : "success"}
            title={
              feedbackState.status === "error"
                ? mergedFeedbackLabels.errorTitle
                : mergedFeedbackLabels.successTitle
            }
            body={feedbackState.message}
            icon={
              feedbackState.status === "error" ? (
                <AlertCircle className="h-5 w-5" />
              ) : (
                <CheckCircle2 className="h-5 w-5" />
              )
            }
            onClose={() => setFeedbackState(ADMIN_FORM_ACTION_IDLE_STATE)}
          />
        </AdminToastViewport>
      ) : null}
    </AdminFormDirtyContext.Provider>
  );
}

export function useAdminFormDirty() {
  return useContext(AdminFormDirtyContext);
}

export function useAdminFormValueSignal<T extends HTMLElement>(dependency: unknown) {
  const elementRef = useRef<T | null>(null);
  const hasMountedRef = useRef(false);

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }

    elementRef.current?.dispatchEvent(
      new CustomEvent(ADMIN_FORM_VALUE_EVENT, {
        bubbles: true,
      }),
    );
  }, [dependency]);

  return elementRef;
}

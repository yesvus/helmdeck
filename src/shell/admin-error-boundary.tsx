// SPDX-License-Identifier: MIT
"use client";

import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { AdminErrorView } from "../primitives/admin-error-view.js";
import type { HelmdeckErrorAdapter, AdminErrorViewLabels } from "../primitives/admin-error-view.js";

type BoundaryState = { error?: Error; digest?: string; componentStack?: string; eventId?: string };

export type AdminErrorBoundaryProps = {
  children?: ReactNode;
  error?: Error & { digest?: string };
  reset?: () => void;
  adapter?: HelmdeckErrorAdapter;
  homeHref?: string;
  labels?: Partial<AdminErrorViewLabels>;
  title?: string;
  description?: string;
  reloadLabel?: string;
};

export class AdminErrorBoundary extends Component<AdminErrorBoundaryProps, BoundaryState> {
  state: BoundaryState = {};

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    let eventId: string | void;
    try {
      eventId = this.props.adapter?.captureException(error, { digest: this.state.digest, componentStack: info.componentStack });
    } catch {
      eventId = undefined;
    }
    this.setState({ componentStack: info.componentStack ?? undefined, eventId: typeof eventId === "string" ? eventId : undefined });
  }

  render() {
    const { error, reset, adapter, children, homeHref, labels } = this.props;
    const caught = this.state.error ?? error;
    if (caught) return <AdminErrorView error={caught} digest={this.state.digest ?? (caught as Error & { digest?: string }).digest} componentStack={this.state.componentStack} reset={reset ?? (() => this.setState({ error: undefined, componentStack: undefined, eventId: undefined }))} eventId={this.state.eventId} showReportDialog={adapter?.showReportDialog} homeHref={homeHref} labels={labels} />;
    return children ?? null;
  }
}

export default AdminErrorBoundary;

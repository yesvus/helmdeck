// SPDX-License-Identifier: MIT
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminErrorView, copyDiagnosticReport } from "../src/primitives/admin-error-view";
import { AdminErrorBoundary } from "../src/shell/admin-error-boundary";

describe("AdminErrorBoundary", () => {
  it("catches a render-time error and shows the admin error view", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    function BrokenChild(): never {
      throw new Error("render failed");
    }

    render(<AdminErrorBoundary><BrokenChild /></AdminErrorBoundary>);

    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");
    expect(screen.getByText("render failed")).toBeInTheDocument();
    expect(screen.queryByText("children")).not.toBeInTheDocument();
    error.mockRestore();
  });

  it("clears its caught error on the default retry action and renders children", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    let shouldThrow = true;
    function MaybeBroken() {
      if (shouldThrow) throw new Error("try again");
      return <p>Recovered child</p>;
    }

    render(<AdminErrorBoundary><MaybeBroken /></AdminErrorBoundary>);
    shouldThrow = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Recovered child")).toBeInTheDocument();
    error.mockRestore();
  });
});

describe("AdminErrorView", () => {
  it("copies a markdown diagnostic report with error details, digest, and timestamp", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<AdminErrorView error={Object.assign(new TypeError("bad request"), { digest: "digest-123" })} digest="digest-123" />);

    fireEvent.click(screen.getByRole("button", { name: "Copy Diagnostic Report" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const report = writeText.mock.calls[0][0] as string;
    expect(report).toContain("# Diagnostic Report");
    expect(report).toContain("- Name: TypeError");
    expect(report).toContain("- Message: bad request");
    expect(report).toContain("- Digest: digest-123");
    expect(report).toMatch(/- Timestamp: \d{4}-\d{2}-\d{2}T/);
  });

  it("returns false without throwing when clipboard and legacy copy are unavailable", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    await expect(copyDiagnosticReport("report")).resolves.toBe(false);
  });

  it("shows the digest prominently when provided", () => {
    render(<AdminErrorView error={new Error("failure")} digest="digest-456" />);

    expect(screen.getByText("Digest: digest-456")).toBeInTheDocument();
  });
});

describe("AdminErrorBoundary adapter", () => {
  it("captures a caught error with digest and component stack, then reports its event id", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = Object.assign(new Error("adapter failure"), { digest: "digest-adapter" });
    const captureException = vi.fn().mockReturnValue("event-123");
    const showReportDialog = vi.fn();
    function BrokenChild(): never {
      throw failure;
    }

    render(<AdminErrorBoundary adapter={{ captureException, showReportDialog }}><BrokenChild /></AdminErrorBoundary>);

    await waitFor(() => expect(captureException).toHaveBeenCalledTimes(1));
    expect(captureException).toHaveBeenCalledWith(failure, expect.objectContaining({ digest: undefined, componentStack: expect.stringContaining("BrokenChild") }));
    fireEvent.click(screen.getByRole("button", { name: "Report Issue" }));
    expect(showReportDialog).toHaveBeenCalledTimes(1);
    expect(showReportDialog).toHaveBeenCalledWith({ eventId: "event-123" });
    consoleError.mockRestore();
  });

  it("does not capture or render a report action without an adapter", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    function BrokenChild(): never {
      throw new Error("no adapter");
    }

    render(<AdminErrorBoundary><BrokenChild /></AdminErrorBoundary>);

    expect(screen.queryByRole("button", { name: "Report Issue" })).not.toBeInTheDocument();
    consoleError.mockRestore();
  });
});

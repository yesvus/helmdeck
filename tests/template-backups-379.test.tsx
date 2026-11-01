// SPDX-License-Identifier: MIT
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DatabaseBackupsPage from "../template/app/admin/backups/page";
import {
  normalizeDatabaseBackups,
  resolveDatabaseBackupsState,
  summarizeDatabaseBackupsRetention,
} from "../template/lib/backups";

describe("database backups contract", () => {
  it("treats a missing snapshot as unconfigured", () => {
    expect(resolveDatabaseBackupsState(undefined)).toBe("unconfigured");
    expect(resolveDatabaseBackupsState(null)).toBe("unconfigured");
  });

  it("resolves an explicit status", () => {
    expect(resolveDatabaseBackupsState({ status: "configured", backups: [{ id: "a", timestamp: "2026-01-01T00:00:00Z" }], retention: "keep 7" })).toBe("configured");
    expect(resolveDatabaseBackupsState({ status: "empty", backups: [], retention: "keep 7" })).toBe("empty");
    expect(resolveDatabaseBackupsState({ status: "stale", backups: [{ id: "a", timestamp: "2026-01-01T00:00:00Z" }], retention: "keep 7" })).toBe("stale");
    expect(resolveDatabaseBackupsState({ status: "unavailable", error: "boom" })).toBe("unavailable");
    expect(resolveDatabaseBackupsState({ status: "unconfigured" })).toBe("unconfigured");
  });

  it("marks a snapshot stale when freshness is false", () => {
    expect(
      resolveDatabaseBackupsState({
        backups: [{ id: "a", timestamp: "2026-01-01T00:00:00Z" }],
        retention: "keep 7",
        fresh: false,
      }),
    ).toBe("stale");
  });

  it("summarizes retention without inventing values", () => {
    expect(summarizeDatabaseBackupsRetention("keep 7 daily")).toBe("keep 7 daily");
    expect(summarizeDatabaseBackupsRetention({ keep: 7, maxAgeDays: 30 })).toBe("Keep 7 backups for 30 days");
    expect(summarizeDatabaseBackupsRetention({ summary: "host policy" })).toBe("host policy");
    expect(summarizeDatabaseBackupsRetention(undefined)).toBeNull();
  });

  it("normalizes nested snapshots", () => {
    const normalized = normalizeDatabaseBackups({ data: { backups: [{ id: "x", timestamp: 1 }], retention: "p" } });
    expect(normalized.state).toBe("configured");
    expect(normalized.backups).toHaveLength(1);
    expect(normalized.retention).toBe("p");
  });
});

describe("database backups page", () => {
  it("renders the unconfigured state when nothing is supplied", () => {
    render(<DatabaseBackupsPage />);
    expect(screen.getByTestId("database-backups")).toHaveAttribute("data-state", "unconfigured");
    expect(screen.getByRole("status")).toHaveTextContent(/not configured/i);
  });

  it("renders the unavailable state with the host error", () => {
    render(<DatabaseBackupsPage status="unavailable" error="backup source down" />);
    expect(screen.getByTestId("database-backups")).toHaveAttribute("data-state", "unavailable");
    expect(screen.getByRole("status")).toHaveTextContent(/unavailable/i);
    expect(screen.getByText(/backup source down/i)).toBeInTheDocument();
  });

  it("renders the empty state", () => {
    render(<DatabaseBackupsPage status="configured" backups={[]} retention="keep 7" />);
    expect(screen.getByTestId("database-backups")).toHaveAttribute("data-state", "empty");
    expect(screen.getByRole("status")).toHaveTextContent(/no backups/i);
    expect(screen.getByText(/keep 7/i)).toBeInTheDocument();
  });

  it("renders the stale state", () => {
    render(
      <DatabaseBackupsPage
        status="stale"
        backups={[{ id: "b1", timestamp: "2026-01-01T00:00:00Z" }]}
        retention={{ keep: 7, maxAgeDays: 30 }}
      />,
    );
    expect(screen.getByTestId("database-backups")).toHaveAttribute("data-state", "stale");
    expect(screen.getByRole("status")).toHaveTextContent(/stale/i);
    expect(screen.getByText("b1")).toBeInTheDocument();
  });

  it("renders the configured state with entries and retention", () => {
    render(
      <DatabaseBackupsPage
        status="configured"
        backups={[
          { id: "a1", timestamp: "2026-01-01T00:00:00Z", size: 1024, kind: "daily" },
        ]}
        retention="keep 7"
      />,
    );
    expect(screen.getByTestId("database-backups")).toHaveAttribute("data-state", "configured");
    expect(screen.getByText("a1")).toBeInTheDocument();
    expect(screen.getByText(/keep 7/i)).toBeInTheDocument();
    expect(screen.getByText(/1024 bytes/i)).toBeInTheDocument();
    expect(screen.getByText(/daily/i)).toBeInTheDocument();
  });
});

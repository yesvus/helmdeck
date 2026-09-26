// SPDX-License-Identifier: MIT
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminI18nProvider } from "../src/i18n";
import { AdminProfilePage } from "../src/shell/admin-profile-page";
import { AdminSettingsPage } from "../src/shell/admin-settings-page";
import type { AdminSession } from "../src/adapters/index";

vi.mock("next/navigation.js", () => ({
  usePathname: () => "/admin/profile",
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/link.js", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const session: AdminSession = { email: "ada@example.com", name: "Ada Lovelace", role: "editor" };

// A fixed instant, so nothing here depends on the clock.
const STARTED = new Date("2026-03-04T09:30:00Z");

function renderPage(locale: string, element: React.ReactElement) {
  return render(<AdminI18nProvider locale={locale}>{element}</AdminI18nProvider>);
}

describe("AdminProfilePage", () => {
  it("shows the identity the session carries", () => {
    renderPage("en", <AdminProfilePage session={session} />);

    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getAllByText("ada@example.com").length).toBeGreaterThan(0);
    expect(screen.getByText("editor")).toBeInTheDocument();
    expect(screen.getByText("Name")).toBeInTheDocument();
  });

  it("falls back to the email when the session has no name", () => {
    renderPage("en", <AdminProfilePage session={{ email: "grace@example.com" }} />);

    expect(screen.getAllByText("grace@example.com").length).toBeGreaterThan(0);
  });

  it("omits the role row entirely when the session carries no role", () => {
    // An empty definition-list term reads as a field that failed to populate.
    renderPage("en", <AdminProfilePage session={{ email: "grace@example.com" }} />);

    expect(screen.queryByText("Role")).not.toBeInTheDocument();
  });

  it("does not render a sign-out-everywhere control the host cannot honour", () => {
    // The alternative is a button that silently does nothing, which is worse than its absence.
    renderPage("en", <AdminProfilePage session={session} sessions={[]} />);

    expect(screen.queryByRole("button", { name: "Sign out everywhere" })).not.toBeInTheDocument();
  });

  it("renders sign out everywhere only when the host supplies it, and calls it", () => {
    const onSignOutEverywhere = vi.fn();
    renderPage(
      "en",
      <AdminProfilePage session={session} sessions={[]} onSignOutEverywhere={onSignOutEverywhere} />,
    );

    screen.getByRole("button", { name: "Sign out everywhere" }).click();
    expect(onSignOutEverywhere).toHaveBeenCalledTimes(1);
  });

  it("marks a busy sign-out-everywhere as disabled and announces it", () => {
    renderPage(
      "en",
      <AdminProfilePage
        session={session}
        sessions={[]}
        onSignOutEverywhere={vi.fn()}
        signOutEverywhereBusy
      />,
    );

    const button = screen.getByRole("button", { name: "Sign out everywhere" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
  });

  it("leaves out the sessions card entirely when the host passes no sessions", () => {
    renderPage("en", <AdminProfilePage session={session} />);

    expect(screen.queryByRole("heading", { name: "Signed-in sessions" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign out everywhere" })).not.toBeInTheDocument();
  });

  it("lists other sessions and keeps the current one out of the list", () => {
    renderPage(
      "en",
      <AdminProfilePage
        session={session}
        sessions={[
          { id: "current", startedAt: STARTED, current: true },
          { id: "laptop", label: "MacBook Pro", startedAt: STARTED },
          { id: "phone", label: "Pixel 8", startedAt: STARTED },
        ]}
        onSignOutEverywhere={vi.fn()}
      />,
    );

    expect(within(screen.getByRole("list")).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("MacBook Pro")).toBeInTheDocument();
    expect(screen.getByText("Pixel 8")).toBeInTheDocument();
    // The visitor's own session is not something they can revoke from this list.
    expect(screen.queryByText("current")).not.toBeInTheDocument();
  });

  it("says so when there are no other sessions", () => {
    renderPage(
      "en",
      <AdminProfilePage
        session={session}
        sessions={[{ id: "current", startedAt: STARTED, current: true }]}
        onSignOutEverywhere={vi.fn()}
      />,
    );

    expect(screen.getByText("No other sessions.")).toBeInTheDocument();
  });

  it("formats a session start deterministically, so a hydration cannot disagree", () => {
    const { unmount } = renderPage(
      "en",
      <AdminProfilePage session={session} sessions={[{ id: "laptop", label: "Laptop", startedAt: STARTED }]} />,
    );
    const first = screen.getByText(/^Started: /).textContent;
    unmount();

    renderPage("en", <AdminProfilePage session={session} sessions={[{ id: "laptop", label: "Laptop", startedAt: STARTED }]} />);
    expect(screen.getByText(/^Started: /).textContent).toBe(first);
    // An absolute timestamp, not a duration: the default reads no clock.
    expect(first).not.toMatch(/ago|önce/);
  });

  it("localises the session start through the active locale", () => {
    const sessions = [{ id: "masa", label: "Masaüstü", startedAt: STARTED }];
    const { unmount } = renderPage("en", <AdminProfilePage session={session} sessions={sessions} />);
    const english = screen.getByText(/^Started: /).textContent ?? "";
    unmount();

    renderPage("tr", <AdminProfilePage session={session} sessions={sessions} />);
    const turkish = screen.getByText(/^Başlangıç: /).textContent ?? "";

    // The two must differ, and Turkish leads with the day where English leads with the month.
    // A hardcoded or locale-blind format would render them identically.
    expect(turkish).not.toBe(english);
    // Compare the formatted timestamps, past the "Started:" label each locale supplies.
    expect(english.split(": ")[1]).toMatch(/^[A-Z][a-z]{2} /);
    expect(turkish.split(": ")[1]).toMatch(/^\d{1,2} /);
  });

  it("uses a host formatter when one is supplied", () => {
    renderPage(
      "en",
      <AdminProfilePage
        session={session}
        sessions={[{ id: "laptop", label: "Laptop", startedAt: STARTED }]}
        formatSessionAge={(value) => `at ${value.getUTCFullYear()}`}
      />,
    );

    expect(screen.getByText("Started: at 2026")).toBeInTheDocument();
  });

  it("accepts a session start as a string, a number, or a Date", () => {
    const entries = [
      { id: "a", label: "A", startedAt: STARTED.toISOString() },
      { id: "b", label: "B", startedAt: STARTED.getTime() },
      { id: "c", label: "C", startedAt: STARTED },
    ];
    renderPage(
      "en",
      <AdminProfilePage
        session={session}
        sessions={entries}
        formatSessionAge={(value) => String(value.toISOString())}
      />,
    );

    const rendered = screen.getAllByText(/^Started: /);
    expect(rendered).toHaveLength(3);
    expect(new Set(rendered.map((node) => node.textContent)).size).toBe(1);
  });

  it("omits the settings card unless the host supplies a destination", () => {
    const { unmount } = renderPage("en", <AdminProfilePage session={session} />);
    expect(screen.queryByRole("heading", { name: "Settings" })).not.toBeInTheDocument();
    unmount();

    renderPage("en", <AdminProfilePage session={session} settingsHref="/admin/settings" />);
    const link = screen.getByRole("link", { name: "Open settings" });
    expect(link).toHaveAttribute("href", "/admin/settings");
  });

  it("puts sign out in the page header and calls the host handler", () => {
    const onSignOut = vi.fn();
    renderPage("en", <AdminProfilePage session={session} onSignOut={onSignOut} />);

    screen.getByRole("button", { name: "Sign out" }).click();
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it("omits the sign-out control when the host supplies no handler", () => {
    renderPage("en", <AdminProfilePage session={session} />);

    expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();
  });

  it("renders host content inside the identity card", () => {
    renderPage(
      "en",
      <AdminProfilePage session={session}>
        <p>Extra identity detail</p>
      </AdminProfilePage>,
    );

    expect(screen.getByText("Extra identity detail")).toBeInTheDocument();
  });
});

describe("AdminSettingsPage", () => {
  it("renders one card per section, in order", () => {
    renderPage(
      "en",
      <AdminSettingsPage
        sections={[
          { id: "general", title: "General", content: <p>General body</p> },
          { id: "mail", title: "Mail", description: "How mail is sent", content: <p>Mail body</p> },
        ]}
      />,
    );

    const headings = screen.getAllByRole("heading", { level: 2 }).map((node) => node.textContent);
    expect(headings).toEqual(["General", "Mail"]);
    expect(screen.getByText("How mail is sent")).toBeInTheDocument();
    expect(screen.getByText("General body")).toBeInTheDocument();
  });

  it("is a usable frame with no sections at all", () => {
    renderPage("en", <AdminSettingsPage />);

    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
  });
});

// SPDX-License-Identifier: MIT
import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it } from "vitest";
import type { AdminPayloadUser } from "@yesvus/helmdeck";
import { AdminBar } from "../src/shell/admin-bar";
import { AdminI18nProvider } from "../src/i18n/provider";
import { resolveAdminBarProps } from "../examples/payload-host/lib/admin-bar";

describe("AdminBar #420", () => {
  it("renders dashboard, optional edit link, and an announced live status", () => {
    render(React.createElement(AdminBar, { dashboardHref: "/admin", draftStatus: "live", editHref: "/admin/posts/1" }));
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/admin");
    expect(screen.getByRole("link", { name: "Edit page" })).toHaveAttribute("href", "/admin/posts/1");
    expect(screen.getByText("Live content")).toHaveAttribute("aria-live", "polite");
  });

  it("omits the optional edit action and uses Turkish labels when selected", () => {
    render(React.createElement(AdminI18nProvider, { locale: "tr", children: React.createElement(AdminBar, { dashboardHref: "/admin", draftStatus: "draft" }) }));
    expect(screen.getByRole("link", { name: "Yönetim paneli" })).toBeInTheDocument();
    expect(screen.getByText("Taslak önizlemesi")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Sayfayı düzenle" })).not.toBeInTheDocument();
  });

  it("resolves the host bar only for an admin session", () => {
    expect(resolveAdminBarProps(null)).toBeNull();
    const editorSession: AdminPayloadUser = { id: "u1", role: "editor" };
    const adminSession: AdminPayloadUser = { id: "u1", role: "admin" };
    expect(resolveAdminBarProps(editorSession)).toBeNull();
    expect(resolveAdminBarProps(adminSession)).toEqual({ dashboardHref: "/admin", draftStatus: "live" });
  });
});

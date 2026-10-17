// SPDX-License-Identifier: MIT
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import {
  AdminActivityPage,
  AdminActivityTimeline,
  adminActivityTone,
  type AdminActivityFilter,
} from "../src/activity";
import { AdminI18nProvider } from "../src/i18n";
import { turkishAdminMessages } from "../src/i18n/messages";
import { AdminPermissionsProvider } from "../src/shell/permissions";
import type { AdminAuditEvent, AdminPermissionsAdapter } from "../src/adapters/index";

/**
 * The trail a host would hand over: three writes by two people, with the field names the package's
 * own event carries and none of their values, because a trail holding every value a record has ever
 * had is a second copy of every secret in the table.
 */
const events: AdminAuditEvent[] = [
  {
    action: "create",
    resource: "products",
    resourceId: "p1",
    actor: { email: "owner@demo.helmdeck.dev", name: "Ada Owner", role: "admin" },
    occurredAt: "2026-10-01T09:00:00.000Z",
    metadata: { fields: ["title", "price"] },
  },
  {
    action: "update",
    resource: "products",
    resourceId: "p1",
    actor: { email: "editor@demo.helmdeck.dev", name: "Ed Editor", role: "editor" },
    occurredAt: "2026-10-05T09:00:00.000Z",
    metadata: { fields: ["price"], source: "bulk import" },
  },
  {
    action: "delete",
    resource: "products",
    resourceId: "p2",
    occurredAt: "2026-10-12T09:00:00.000Z",
  },
];

const NOW = () => new Date("2026-10-16T09:00:00.000Z");

function allowAll(): AdminPermissionsAdapter {
  return { can: vi.fn(async () => true) };
}

function denyAll(): AdminPermissionsAdapter {
  return { can: vi.fn(async () => false) };
}

function tree(element: React.ReactElement, adapter: AdminPermissionsAdapter = allowAll(), locale = "en") {
  return (
    <AdminI18nProvider locale={locale}>
      <AdminPermissionsProvider adapter={adapter}>{element}</AdminPermissionsProvider>
    </AdminI18nProvider>
  );
}

/** The events one row reads as, in the order the trail prints them. */
function renderedRows(): HTMLElement[] {
  return screen.getAllByRole("listitem");
}

function rowOf(action: string): HTMLElement {
  const found = renderedRows().find((row) => row.textContent?.startsWith(action));
  if (!found) throw new Error(`no row starting with ${action}`);
  return found;
}

describe("adminActivityTone", () => {
  it("maps the operations the package records, and leaves a host's own action neutral", () => {
    expect(adminActivityTone("create")).toBe("success");
    expect(adminActivityTone("update")).toBe("info");
    expect(adminActivityTone("delete")).toBe("danger");
    expect(adminActivityTone("publish")).toBe("neutral");
    expect(adminActivityTone("PUBLISH")).toBe("neutral");
  });
});

describe("AdminActivityTimeline", () => {
  it("prints each event newest first with its action, resource, actor and age", () => {
    render(tree(<AdminActivityTimeline events={events} now={NOW} />));

    const rows = renderedRows();
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("delete");
    expect(rows[0]).toHaveTextContent("products");
    expect(rows[2]).toHaveTextContent("Ada Owner owner@demo.helmdeck.dev admin");
    // The exact time sits beside the age, so a reader can place an event the age has gone stale on.
    expect(rows[0]).toHaveTextContent("4 days ago");
    expect(screen.getAllByRole("time")[0]).toHaveAttribute("dateTime", "2026-10-12T09:00:00.000Z");
  });

  it("says so when an event names nobody, rather than leaving the line blank", () => {
    render(tree(<AdminActivityTimeline events={events} now={NOW} />));

    expect(rowOf("delete")).toHaveTextContent("Unknown actor");
  });

  it("narrows to one action and brings the rest back when the filter is cleared", async () => {
    const user = userEvent.setup();
    render(tree(<AdminActivityTimeline events={events} now={NOW} />));

    await user.selectOptions(screen.getByLabelText("Action"), "update");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(renderedRows()).toHaveLength(1);
    expect(renderedRows()[0]).toHaveTextContent("Ed Editor editor@demo.helmdeck.dev editor");

    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(renderedRows()).toHaveLength(3);
  });

  it("searches the actor by any part of who they are, so a role is as findable as an email", async () => {
    const user = userEvent.setup();
    render(tree(<AdminActivityTimeline events={events} now={NOW} />));

    await user.type(screen.getByLabelText("Actor"), "editor@");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(renderedRows()).toHaveLength(1);

    // The role, which is the part of who someone is that appears in neither their name nor their email.
    await user.clear(screen.getByLabelText("Actor"));
    await user.type(screen.getByLabelText("Actor"), "admin");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(renderedRows()).toHaveLength(1);
    expect(renderedRows()[0]).toHaveTextContent("create");
  });

  it("reads a date range as whole days, and narrows from either end of it", async () => {
    const user = userEvent.setup();
    render(tree(<AdminActivityTimeline events={events} now={NOW} />));

    await user.type(screen.getByLabelText("From"), "2026-10-05");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(renderedRows()).toHaveLength(2);

    await user.clear(screen.getByLabelText("From"));
    await user.type(screen.getByLabelText("From"), "2026-10-01");
    await user.type(screen.getByLabelText("To"), "2026-10-05");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(renderedRows()).toHaveLength(2);

    await user.clear(screen.getByLabelText("To"));
    await user.type(screen.getByLabelText("To"), "2026-10-01");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(renderedRows()).toHaveLength(1);
    expect(renderedRows()[0]).toHaveTextContent("create");
  });

  it("explains an empty result rather than showing a blank page", async () => {
    const user = userEvent.setup();
    render(tree(<AdminActivityTimeline events={events} now={NOW} />));

    await user.type(screen.getByLabelText("From"), "2026-11-01");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(screen.getByText("No activity matches these filters")).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("shows the metadata an event carries when its details are opened, and hides them again", async () => {
    const user = userEvent.setup();
    render(tree(<AdminActivityTimeline events={events} now={NOW} />));

    const row = rowOf("update");
    expect(within(row).queryByText("bulk import")).not.toBeInTheDocument();

    await user.click(within(row).getByRole("button", { name: "Details" }));
    expect(within(row).getByText("bulk import")).toBeInTheDocument();
    // The names of the fields a write touched read as themselves rather than as a JSON array.
    expect(within(row).getByText("price")).toBeInTheDocument();
    expect(within(row).getByText("p1")).toBeInTheDocument();

    await user.click(within(row).getByRole("button", { name: "Hide details" }));
    expect(within(row).queryByText("bulk import")).not.toBeInTheDocument();
  });

  it("says an event carries no metadata rather than opening onto an empty panel", async () => {
    const user = userEvent.setup();
    render(tree(<AdminActivityTimeline events={events} now={NOW} />));

    await user.click(within(rowOf("delete")).getByRole("button", { name: "Details" }));
    expect(screen.getByText("This event carries no metadata.")).toBeInTheDocument();
  });

  it("says the trail is empty until something is recorded", () => {
    render(tree(<AdminActivityTimeline events={[]} now={NOW} />));

    expect(screen.getByText("No activity yet")).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("shows at most the cap, and says how many of the trail that is", () => {
    render(tree(<AdminActivityTimeline events={events} now={NOW} cap={2} />));

    expect(renderedRows()).toHaveLength(2);
    expect(screen.getByText("Showing 2 of 3 events")).toBeInTheDocument();
  });

  it("lets a reader reach the rest of the trail, rather than capping it out of reach", async () => {
    const user = userEvent.setup();
    render(tree(<AdminActivityTimeline events={events} now={NOW} cap={2} />));

    await user.click(screen.getByRole("button", { name: "Show 1 more" }));
    expect(renderedRows()).toHaveLength(3);
    expect(screen.getByText("Showing 3 of 3 events")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Show \d+ more/ })).not.toBeInTheDocument();
  });

  it("starts again at the first page when the filter changes, rather than staying where it was", async () => {
    const user = userEvent.setup();
    render(tree(<AdminActivityTimeline events={events} now={NOW} cap={1} />));

    await user.click(screen.getByRole("button", { name: "Show 2 more" }));
    await user.click(screen.getByRole("button", { name: "Show 1 more" }));
    expect(renderedRows()).toHaveLength(3);

    await user.selectOptions(screen.getByLabelText("Action"), "delete");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(renderedRows()).toHaveLength(1);
  });

  it("prints a value it cannot serialize rather than losing the row it belongs to", async () => {
    const user = userEvent.setup();
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    render(
      tree(
        <AdminActivityTimeline
          events={[{ action: "update", resource: "products", resourceId: "p1", metadata: { loop: circular } }]}
          now={NOW}
        />,
      ),
    );

    await user.click(within(rowOf("update")).getByRole("button", { name: "Details" }));
    expect(within(rowOf("update")).getByText("[object Object]")).toBeInTheDocument();
    expect(renderedRows()).toHaveLength(1);
  });

  it("keeps an event with no usable time in place rather than sorting it on a guess", () => {
    render(
      tree(
        <AdminActivityTimeline
          events={[
            { action: "create", resource: "orders", occurredAt: "not a date" },
            { action: "update", resource: "orders", occurredAt: "2026-10-02T09:00:00.000Z" },
          ]}
          now={NOW}
        />,
      ),
    );

    const rows = renderedRows();
    expect(rows[0]).toHaveTextContent("update");
    expect(rows[1]).toHaveTextContent("at an unknown time");
  });

  it("hands the filter to a loader rather than narrowing a page it already fetched", async () => {
    const user = userEvent.setup();
    const load = vi.fn(async (filter: AdminActivityFilter) =>
      events.filter((event) => !filter.action || event.action === filter.action),
    );
    render(tree(<AdminActivityTimeline load={load} actions={["create", "update", "delete"]} now={NOW} />));

    await waitFor(() => expect(renderedRows()).toHaveLength(3));
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenLastCalledWith({});

    await user.selectOptions(screen.getByLabelText("Action"), "delete");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(renderedRows()).toHaveLength(1));
    expect(load).toHaveBeenLastCalledWith({ action: "delete" });
  });

  it("offers the action filter only when the names are known, because one value is not a filter", () => {
    render(tree(<AdminActivityTimeline events={[]} now={NOW} />));

    expect(screen.queryByLabelText("Action")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Actor")).toBeInTheDocument();
  });

  it("reports a loader that refused, rather than printing an empty trail", async () => {
    render(
      tree(
        <AdminActivityTimeline
          load={async () => {
            throw new Error("store is down");
          }}
          now={NOW}
        />,
      ),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("The activity trail could not be loaded.");
  });

  it("shows nothing at all for a reader the rule refuses, and never asks", async () => {
    const load = vi.fn(async () => events);
    render(tree(<AdminActivityTimeline load={load} permission="activity.read" now={NOW} />, denyAll()));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "You do not have access to this.",
    );
    expect(load).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Actor")).not.toBeInTheDocument();
  });

  it("prints the trail in Turkish when the shell is in Turkish", () => {
    render(
      tree(
        <AdminActivityTimeline events={events} now={NOW} />,
        allowAll(),
        "tr",
      ),
    );

    expect(screen.getByText("Filtreler")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Uygula" })).toBeInTheDocument();
    expect(turkishAdminMessages.activity?.title).toBe("Etkinlik");
  });

  it("takes the wording a host replaces, one label at a time", () => {
    render(tree(<AdminActivityTimeline events={[]} now={NOW} labels={{ empty: "Nothing has happened yet" }} />));

    expect(screen.getByText("Nothing has happened yet")).toBeInTheDocument();
  });
});

describe("AdminActivityPage", () => {
  it("mounts the whole page, so a host adds a route rather than a project", () => {
    render(tree(<AdminActivityPage events={events} now={NOW} />));

    expect(screen.getByRole("heading", { level: 1, name: "Activity" })).toBeInTheDocument();
    expect(screen.getByText("What changed, who changed it, and when.")).toBeInTheDocument();
    expect(renderedRows()).toHaveLength(3);
  });

  it("lets the host name the page", () => {
    render(tree(<AdminActivityPage events={events} now={NOW} title="Site activity" description="Every write." />));

    expect(screen.getByRole("heading", { level: 1, name: "Site activity" })).toBeInTheDocument();
    expect(screen.getByText("Every write.")).toBeInTheDocument();
  });

  it("passes the permission down, so a refused reader sees the refusal and not the filters", async () => {
    render(tree(<AdminActivityPage events={events} permission="activity.read" now={NOW} />, denyAll()));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "You do not have access to this.",
    );
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Actor")).not.toBeInTheDocument();
  });
});
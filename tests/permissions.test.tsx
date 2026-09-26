// SPDX-License-Identifier: MIT
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useEffect } from "react";
import { AdminI18nProvider } from "../src/i18n";
import {
  AdminCan,
  AdminPermissionsProvider,
  useAdminCan,
  useAdminPermission,
} from "../src/shell/permissions";
import { useAdminPermittedNav } from "../src/shell/permitted-nav";
import type { AdminPermissionsAdapter, AdminNavGroup } from "../src/adapters/index";

vi.mock("next/navigation.js", () => ({
  usePathname: () => "/admin",
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

/** Grants everything except what is named in `denied`. */
let commitCount = 0;

function adapter(denied: string[] = [], overrides: Partial<AdminPermissionsAdapter> = {}): AdminPermissionsAdapter {
  return {
    can: vi.fn(async (permission: string) => !denied.includes(permission)),
    ...overrides,
  };
}

function denied() {
  return (
    <div>
      <button type="button">Delete record</button>
      <p>billing</p>
    </div>
  );
}

function Probe({ permission, resourceId }: { permission: string; resourceId?: string }) {
  const state = useAdminPermission(permission, resourceId === undefined ? undefined : { resourceId });
  return <span data-testid="state">{state}</span>;
}

function CanProbe({ permission, resourceId }: { permission: string; resourceId?: string }) {
  const allowed = useAdminCan(permission, resourceId === undefined ? undefined : { resourceId });
  return <span data-testid="can">{String(allowed)}</span>;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AdminCan", () => {
  it("renders the children only once the permission is confirmed", async () => {
    render(
      <AdminPermissionsProvider adapter={adapter()}>
        <AdminCan permission="billing.read">{denied()}</AdminCan>
      </AdminPermissionsProvider>,
    );

    // Not present before the answer arrives, and not after a refusal.
    expect(screen.queryByText("Delete record")).not.toBeInTheDocument();
    expect(await screen.findByText("Delete record")).toBeInTheDocument();
  });

  it("withholds the children entirely while the permission is being resolved", async () => {
    // Rendering them and hiding them would leave a real button in the tab order and readable
    // text in the accessibility tree for an action this visitor may not perform.
    let release: (value: boolean) => void = () => {};
    const slow: AdminPermissionsAdapter = {
      can: () => new Promise<boolean>((resolve) => { release = resolve; }),
    };
    render(
      <AdminPermissionsProvider adapter={slow}>
        <AdminCan permission="billing.write">{denied()}</AdminCan>
      </AdminPermissionsProvider>,
    );

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText("billing")).not.toBeInTheDocument();

    release(true);
    expect(await screen.findByText("Delete record")).toBeInTheDocument();
  });

  it("renders nothing at all for a refused permission unless given a fallback", async () => {
    render(
      <AdminPermissionsProvider adapter={adapter(["billing.write"])}>
        <AdminCan permission="billing.write">{denied()}</AdminCan>
      </AdminPermissionsProvider>,
    );

    await waitFor(() => expect(screen.queryByText("Delete record")).not.toBeInTheDocument());
    expect(screen.queryByText("billing")).not.toBeInTheDocument();
  });

  it("defaults to an announced refusal, localized", async () => {
    render(
      <AdminI18nProvider locale="en">
        <AdminPermissionsProvider adapter={adapter(["billing.write"])}>
          <AdminCan permission="billing.write">{denied()}</AdminCan>
        </AdminPermissionsProvider>
      </AdminI18nProvider>,
    );

    expect(await screen.findByRole("status")).toHaveTextContent("You do not have access to this.");
  });

  it("uses a host fallback instead of the default refusal", async () => {
    render(
      <AdminPermissionsProvider adapter={adapter(["billing.write"])}>
        <AdminCan permission="billing.write" fallback={<p>Ask an owner for access.</p>}>
          {denied()}
        </AdminCan>
      </AdminPermissionsProvider>,
    );

    expect(await screen.findByText("Ask an owner for access.")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("denies when the adapter rejects, rather than allowing", async () => {
    const broken: AdminPermissionsAdapter = { can: vi.fn().mockRejectedValue(new Error("permission service down")) };
    render(
      <AdminPermissionsProvider adapter={broken}>
        <AdminCan permission="billing.write">{denied()}</AdminCan>
      </AdminPermissionsProvider>,
    );

    expect(await screen.findByRole("status")).toBeInTheDocument();
    expect(screen.queryByText("Delete record")).not.toBeInTheDocument();
  });

  it("denies when there is no adapter at all, and says why in development", async () => {
    // A missing adapter must never read as permission granted. The warning is what keeps that
    // from being a silent first-run mystery.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(
      <AdminPermissionsProvider>
        <AdminCan permission="billing.write">{denied()}</AdminCan>
      </AdminPermissionsProvider>,
    );

    expect(await screen.findByRole("status")).toBeInTheDocument();
    expect(screen.queryByText("Delete record")).not.toBeInTheDocument();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("without an AdminPermissionsProvider"));
  });

  it("denies rather than throwing when the guard is used with no provider at all", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(
      <AdminCan permission="billing.write" fallback={<p>denied</p>}>
        {denied()}
      </AdminCan>,
    );

    expect(await screen.findByText("denied")).toBeInTheDocument();
    expect(warn).toHaveBeenCalled();
  });

  it("passes the resource context through to the adapter", async () => {
    const auth = adapter();
    render(
      <AdminPermissionsProvider adapter={auth}>
        <AdminCan permission="records.delete" resourceId="rec_42">
          {denied()}
        </AdminCan>
      </AdminPermissionsProvider>,
    );

    await screen.findByText("Delete record");
    expect(auth.can).toHaveBeenCalledWith("records.delete", { resourceId: "rec_42" });
  });

  it("asks the adapter once for several guards sharing a permission", async () => {
    // Without the shared cache, five guards on a page mean five round trips on every mount.
    const auth = adapter();
    render(
      <AdminPermissionsProvider adapter={auth}>
        <Probe permission="billing.read" />
        <Probe permission="billing.read" />
        <Probe permission="billing.read" />
        <AdminCan permission="billing.read">ok</AdminCan>
      </AdminPermissionsProvider>,
    );

    await waitFor(() => expect(screen.getAllByTestId("state")[0]).toHaveTextContent("allowed"));
    expect(auth.can).toHaveBeenCalledTimes(1);
  });

  it("asks again for a different resource, because the answer differs", async () => {
    const auth = adapter();
    render(
      <AdminPermissionsProvider adapter={auth}>
        <Probe permission="records.delete" resourceId="a" />
        <Probe permission="records.delete" resourceId="b" />
      </AdminPermissionsProvider>,
    );

    await waitFor(() => expect(screen.getAllByTestId("state")[0]).toHaveTextContent("allowed"));
    expect(auth.can).toHaveBeenCalledTimes(2);
  });

  it("does not show the previous permission's verdict while a new one resolves", async () => {
    const auth = adapter(["billing.write"]);
    const { rerender } = render(
      <AdminPermissionsProvider adapter={auth}>
        <CanProbe permission="billing.write" />
      </AdminPermissionsProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("can")).toHaveTextContent("false"));

    rerender(
      <AdminPermissionsProvider adapter={auth}>
        <CanProbe permission="billing.read" />
      </AdminPermissionsProvider>,
    );

    // "checking" is not false and not true: the stale refusal is not carried over.
    expect(screen.getByTestId("can")).toHaveTextContent("false");
    await waitFor(() => expect(screen.getByTestId("can")).toHaveTextContent("true"));
  });

  it("settles when the caller passes a fresh context object on every render", async () => {
    // titiz's finding: depending on the context object re-ran the effect every render, and the
    // effect sets state, so the render never settled. A caller writing `{ resourceId }`
    // inline is the ordinary way to pass one.
    // Counted in an effect, which is a commit rather than a render, so this measures how many
    // times React actually committed rather than how many times a function was called.
    commitCount = 0;
    function Counting() {
      const state = useAdminPermission("records.delete", { resourceId: "rec_1" });
      useEffect(() => {
        commitCount += 1;
      });
      return <span data-testid="state">{state}</span>;
    }
    render(
      <AdminPermissionsProvider adapter={adapter()}>
        <Counting />
      </AdminPermissionsProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("allowed"));
    const settled = commitCount;
    await new Promise((resolve) => setTimeout(resolve, 80));
    // A loop would keep climbing; settling means it stopped.
    expect(commitCount).toBe(settled);
    expect(commitCount).toBeLessThan(10);
  });

  it("re-resolves when the adapter is replaced", async () => {
    const first = adapter(["billing.write"]);
    const { rerender } = render(
      <AdminPermissionsProvider adapter={first}>
        <Probe permission="billing.write" />
      </AdminPermissionsProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("denied"));

    const second = adapter();
    rerender(
      <AdminPermissionsProvider adapter={second}>
        <Probe permission="billing.write" />
      </AdminPermissionsProvider>,
    );

    // The earlier refusal belonged to the adapter that went away.
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("allowed"));
  });
});

const nav: AdminNavGroup[] = [
  {
    label: "Workspace",
    items: [
      { href: "/admin", label: "Dashboard" },
      { href: "/admin/billing", label: "Billing", permission: "billing.read" },
      { href: "/admin/users", label: "Users", permission: "users.read" },
    ],
  },
];

function NavProbe({ groups }: { groups: AdminNavGroup[] }) {
  const { groups: permitted, pending } = useAdminPermittedNav(groups);
  return (
    <div>
      <span data-testid="pending">{String(pending)}</span>
      <span data-testid="labels">{permitted.flatMap((group) => group.items.map((item) => item.label)).join(",")}</span>
      <span data-testid="groups">{permitted.map((group) => group.label).join(",")}</span>
    </div>
  );
}

/** Exact, because toHaveTextContent matches on substring. */
function labels(): string {
  return screen.getByTestId("labels").textContent ?? "";
}

function groupLabels(): string {
  return screen.getByTestId("groups").textContent ?? "";
}

describe("useAdminPermittedNav", () => {
  it("keeps every ungated item and hides a refused one", async () => {
    render(
      <AdminPermissionsProvider adapter={adapter(["users.read"])}>
        <NavProbe groups={nav} />
      </AdminPermissionsProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("pending")).toHaveTextContent("false"));
    expect(labels()).toBe("Dashboard,Billing");
  });

  it("shows nothing at all until the permissions are answered", async () => {
    // A nav that renders unfiltered and then hides items puts links to unreachable pages into
    // the tab order, and visibly repopulates the sidebar.
    // One promise per permission, so every resolver has to be held and released together.
    const releases: Array<(value: boolean) => void> = [];
    const slow: AdminPermissionsAdapter = {
      can: () => new Promise<boolean>((resolve) => { releases.push(resolve); }),
    };
    render(
      <AdminPermissionsProvider adapter={slow}>
        <NavProbe groups={nav} />
      </AdminPermissionsProvider>,
    );

    expect(labels()).toBe("");
    expect(screen.getByTestId("pending")).toHaveTextContent("true");

    expect(releases).toHaveLength(2);
    for (const release of releases) release(true);
    await waitFor(() => expect(screen.getByTestId("pending")).toHaveTextContent("false"));
    expect(labels()).toBe("Dashboard,Billing,Users");
  });

  it("drops a group left with no visible items", async () => {
    render(
      <AdminPermissionsProvider adapter={adapter(["billing.read", "users.read"])}>
        <NavProbe groups={nav} />
      </AdminPermissionsProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("pending")).toHaveTextContent("false"));
    expect(labels()).toBe("Dashboard");
    // A group left with nothing in it is dropped, so the sidebar does not show an empty
    // heading over nothing.
    expect(groupLabels()).toBe("Workspace");
  });

  it("shows ungated items and hides gated ones when there is no adapter", async () => {
    // titiz's other finding: with no adapter the resolve step never ran, so the nav stayed
    // empty for good. That is fail-closed, but a permanent blank sidebar reads as a broken
    // shell rather than a refusal.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(
      <AdminPermissionsProvider>
        <NavProbe groups={nav} />
      </AdminPermissionsProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("pending")).toHaveTextContent("false"));
    expect(labels()).toBe("Dashboard");
    expect(groupLabels()).toBe("Workspace");
    expect(warn).toHaveBeenCalled();
  });

  it("drops a group whose every item is refused", async () => {
    const gatedOnly: AdminNavGroup[] = [
      { label: "Workspace", items: [{ href: "/admin", label: "Dashboard" }] },
      { label: "Billing", items: [{ href: "/admin/billing", label: "Invoices", permission: "billing.read" }] },
    ];
    render(
      <AdminPermissionsProvider adapter={adapter(["billing.read"])}>
        <NavProbe groups={gatedOnly} />
      </AdminPermissionsProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("pending")).toHaveTextContent("false"));
    expect(groupLabels()).toBe("Workspace");
  });

  it("resolves each distinct permission once, however many items share it", async () => {
    const auth = adapter();
    const shared: AdminNavGroup[] = [
      {
        label: "Workspace",
        items: [
          { href: "/a", label: "A", permission: "billing.read" },
          { href: "/b", label: "B", permission: "billing.read" },
          { href: "/c", label: "C", permission: "billing.read" },
        ],
      },
    ];
    render(
      <AdminPermissionsProvider adapter={auth}>
        <NavProbe groups={shared} />
      </AdminPermissionsProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("pending")).toHaveTextContent("false"));
    expect(auth.can).toHaveBeenCalledTimes(1);
  });

  it("passes a nav with no gated items straight through", async () => {
    const auth = adapter();
    render(
      <AdminPermissionsProvider adapter={auth}>
        <NavProbe groups={[{ label: "Workspace", items: [{ href: "/a", label: "A" }] }]} />
      </AdminPermissionsProvider>,
    );

    expect(screen.getByTestId("pending")).toHaveTextContent("false");
    expect(labels()).toBe("A");
    expect(auth.can).not.toHaveBeenCalled();
  });

  it("stops re-resolving when the host rebuilds the nav array each render", async () => {
    // An inline nav={[{...}]} is a new array every render. Depending on its identity would
    // re-resolve, which sets state, which re-renders, forever.
    const auth = adapter();
    function Inline() {
      return <NavProbe groups={[{ label: "W", items: [{ href: "/a", label: "A", permission: "billing.read" }] }]} />;
    }
    render(
      <AdminPermissionsProvider adapter={auth}>
        <Inline />
      </AdminPermissionsProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("pending")).toHaveTextContent("false"));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(auth.can).toHaveBeenCalledTimes(1);
  });
});

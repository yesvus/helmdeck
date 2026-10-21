// SPDX-License-Identifier: MIT
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminRecordSearch } from "../src/shell/admin-record-search.js";
import { AdminSearch } from "../src/shell/admin-search.js";
import { AdminShell } from "../src/shell/admin-shell.js";
import type { AdminSearchAdapter } from "../src/adapters/search.js";

const push = vi.fn();
vi.mock("next/navigation.js", () => ({ usePathname: () => "/admin", useRouter: () => ({ push }) }));

afterEach(() => {
  vi.clearAllMocks();
});

function result(resourceId: string, label = `Order ${resourceId}`) {
  return {
    resource: "orders",
    resourceLabel: "Orders",
    resourceId,
    label,
    href: `/admin/orders/${resourceId}`,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe("AdminRecordSearch", () => {
  it("finds records across resources, announces the count, and navigates by keyboard", async () => {
    const user = userEvent.setup();
    const search = vi.fn<AdminSearchAdapter["search"]>().mockResolvedValue([
      result("4412"),
      { ...result("c-7", "Ada Lovelace"), resource: "customers", resourceLabel: "Customers", href: "/admin/customers/c-7" },
    ]);
    render(<AdminRecordSearch adapter={{ search }} />);

    await user.keyboard("{Control>}{Shift>}k{/Shift}{/Control}");
    const input = screen.getByRole("combobox", { name: "Search records" });
    await user.type(input, "4412");

    expect(await screen.findByRole("option", { name: /Order 4412/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Ada Lovelace/ })).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(input).toHaveAttribute("aria-controls");
    expect(screen.getByRole("status")).toHaveTextContent("2 results");
    expect(search).toHaveBeenLastCalledWith("4412", expect.any(AbortSignal));

    await user.keyboard("{ArrowDown}{Enter}");
    expect(push).toHaveBeenCalledWith("/admin/customers/c-7");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("shows loading, empty, error, and retry states", async () => {
    const first = deferred<ReturnType<typeof result>[]>();
    const search = vi.fn<AdminSearchAdapter["search"]>()
      .mockReturnValueOnce(first.promise)
      .mockRejectedValueOnce(new Error("Search service unavailable"))
      .mockResolvedValueOnce([result("4412")]);
    render(<AdminRecordSearch adapter={{ search }} />);
    fireEvent.click(screen.getByRole("button", { name: "Search records" }));
    const input = screen.getByRole("combobox", { name: "Search records" });

    fireEvent.change(input, { target: { value: "nothing" } });
    expect(screen.getByText("Searching records.")).toBeInTheDocument();
    // The panel is on screen while it searches, so the field says it is expanded even though
    // the list of results is not there yet.
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(input).not.toHaveAttribute("aria-controls");
    first.resolve([]);
    expect(await screen.findByText("No matching records.")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("0 results");

    fireEvent.change(input, { target: { value: "error" } });
    expect(await screen.findByRole("status")).toHaveTextContent("Search service unavailable");
    expect(screen.getByText("Search service unavailable", { selector: "p.mt-2" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("option", { name: /Order 4412/ })).toBeInTheDocument();
  });

  it("keeps the newest search result when older requests finish later", async () => {
    const oldRequest = deferred<ReturnType<typeof result>[]>();
    const newRequest = deferred<ReturnType<typeof result>[]>();
    const search = vi.fn<AdminSearchAdapter["search"]>((query) => query === "old" ? oldRequest.promise : newRequest.promise);
    render(<AdminRecordSearch adapter={{ search }} />);
    fireEvent.click(screen.getByRole("button", { name: "Search records" }));
    const input = screen.getByRole("combobox", { name: "Search records" });
    fireEvent.change(input, { target: { value: "old" } });
    await waitFor(() => expect(search).toHaveBeenCalledWith("old", expect.any(AbortSignal)));
    fireEvent.change(input, { target: { value: "new" } });
    await waitFor(() => expect(search).toHaveBeenCalledWith("new", expect.any(AbortSignal)));

    newRequest.resolve([result("new-1", "New match")]);
    expect(await screen.findByRole("option", { name: /New match/ })).toBeInTheDocument();
    oldRequest.resolve([result("old-1", "Old match")]);
    await waitFor(() => expect(screen.queryByText("Old match")).not.toBeInTheDocument());
    expect(screen.getByRole("option", { name: /New match/ })).toBeInTheDocument();
  });

  it("opens with the dedicated shortcut and closes with Escape", async () => {
    const user = userEvent.setup();
    render(<AdminRecordSearch adapter={{ search: vi.fn(async () => []) }} />);

    await user.keyboard("{Control>}{Shift>}k{/Shift}{/Control}");
    expect(screen.getByRole("combobox", { name: "Search records" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("combobox", { name: "Search records" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Search records" })).toHaveFocus();
  });

  it("keeps focus in record search when both search shortcuts are mounted", async () => {
    const user = userEvent.setup();
    render(
      <>
        <AdminSearch groups={[]} />
        <AdminRecordSearch adapter={{ search: vi.fn(async () => []) }} />
      </>,
    );

    await user.keyboard("{Control>}{Shift>}k{/Shift}{/Control}");
    const input = screen.getByRole("combobox", { name: "Search records" });
    await waitFor(() => expect(input).toHaveFocus());
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(input).toHaveFocus();
  });

  it("does not select a result when Enter activates the close button", async () => {
    const user = userEvent.setup();
    const search = vi.fn<AdminSearchAdapter["search"]>().mockResolvedValue([result("4412")]);
    render(<AdminRecordSearch adapter={{ search }} />);
    await user.click(screen.getByRole("button", { name: "Search records" }));
    await user.type(screen.getByRole("combobox", { name: "Search records" }), "4412");
    await screen.findByRole("option", { name: /Order 4412/ });

    screen.getByRole("button", { name: "Close record search" }).focus();
    await user.keyboard("{Enter}");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("does not add record search to a shell without an adapter", () => {
    render(<AdminShell nav={[]}><div>Page content</div></AdminShell>);

    expect(screen.queryByRole("button", { name: "Search records" })).not.toBeInTheDocument();
  });

  it("keeps defaults when an optional label override is undefined", async () => {
    const user = userEvent.setup();
    render(
      <AdminRecordSearch
        adapter={{ search: async () => [result("4412"), result("4413")] }}
        labels={{ recordSearchManyResults: undefined }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Search records" }));
    await user.type(screen.getByRole("combobox", { name: "Search records" }), "441");

    expect(await screen.findByRole("status")).toHaveTextContent("2 results");
  });
});

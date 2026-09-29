// SPDX-License-Identifier: MIT
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AdminI18nProvider } from "../src/i18n";
import { AdminDashboardTiles } from "../src/dashboard/tiles";
import { createAdminWidgetRegistry, defineAdminWidget } from "../src/widgets/registry";
import type { AdminWidgetLoader } from "../src/widgets/data";
import type { AdminDashboardPlacement } from "../src/dashboard/model";

const counter = defineAdminWidget<{ total: number }>({
  id: "counter",
  title: "Signups",
  sizes: ["sm", "md"],
  render: (data) => <p>{data.total} signups</p>,
});

const registry = createAdminWidgetRegistry({ counter });

const placements: AdminDashboardPlacement[] = [
  { id: "p0", widget: "counter", size: "sm" },
  { id: "p1", widget: "counter", size: "md" },
];

function never(): Promise<never> {
  return new Promise(() => {});
}

function Harness({
  loaders,
  items = placements,
}: {
  loaders: Record<string, AdminWidgetLoader<unknown>>;
  items?: AdminDashboardPlacement[];
}) {
  return (
    <AdminI18nProvider locale="en">
      <AdminDashboardTiles registry={registry} placements={items} loaders={loaders} />
    </AdminI18nProvider>
  );
}

describe("AdminDashboardTiles", () => {
  it("shows one tile while a slow widget is still loading and another already has data", async () => {
    // The property the epic asks for: a slow widget must not hold up a neighbour that is ready.
    render(
      <Harness
        loaders={{
          p0: () => new Promise(() => {}),
          p1: async () => ({ total: 7 }),
        }}
      />,
    );

    // Both start loading: neither loader has resolved yet, so nothing here is gated on the slow one.
    expect(document.querySelectorAll("[data-widget-state='loading']")).toHaveLength(2);
    await waitFor(() => expect(screen.getByText("7 signups")).toBeInTheDocument());
    // Still exactly the one that never resolved, rather than both or neither.
    expect(document.querySelectorAll("[data-widget-state='loading']")).toHaveLength(1);
    expect(document.querySelectorAll("[data-widget-state='ready']")).toHaveLength(1);
  });

  it("renders two tiles independently rather than sharing one result", async () => {
    render(
      <Harness
        loaders={{
          p0: async () => ({ total: 1 }),
          p1: async () => ({ total: 2 }),
        }}
      />,
    );

    await waitFor(() => expect(screen.getByText("1 signups")).toBeInTheDocument());
    expect(screen.getByText("2 signups")).toBeInTheDocument();
  });

  it("retries only the tile that failed", async () => {
    const user = userEvent.setup();
    const p1 = vi.fn().mockRejectedValue(new Error("upstream down"));
    render(
      <Harness
        loaders={{
          p0: async () => ({ total: 3 }),
          p1,
        }}
      />,
    );

    await waitFor(() => expect(screen.getByText("upstream down")).toBeInTheDocument());
    expect(p1).toHaveBeenCalledTimes(1);

    p1.mockResolvedValue({ total: 5 });
    await user.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(screen.getByText("5 signups")).toBeInTheDocument());
    // The healthy tile was not reloaded, or this would be 2.
    expect(screen.getByText("3 signups")).toBeInTheDocument();
  });

  it("names a widget the build no longer provides, without hiding the others", async () => {
    render(
      <Harness
        items={[{ id: "p0", widget: "ghost", size: "sm" }, ...placements]}
        loaders={{ p1: async () => ({ total: 4 }) }}
      />,
    );

    expect(screen.getByText(/which this build does not provide/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("4 signups")).toBeInTheDocument());
  });

  it("does not reload a tile when an unrelated prop changes", async () => {
    // The loader identity is memoized per tile, so a re-render must not restart every load on screen.
    const load = vi.fn().mockResolvedValue({ total: 9 });
    const { rerender } = render(<Harness loaders={{ p0: load, p1: never }} />);
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));

    rerender(
      <AdminI18nProvider locale="en">
        <AdminDashboardTiles registry={registry} placements={placements} loaders={{ p0: load, p1: never }} className="mt-2" />
      </AdminI18nProvider>,
    );

    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
  });
});

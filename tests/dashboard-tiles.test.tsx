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
  className,
}: {
  loaders: Record<string, AdminWidgetLoader<unknown>>;
  items?: AdminDashboardPlacement[];
  className?: string;
}) {
  return (
    <AdminI18nProvider locale="en">
      <AdminDashboardTiles
        registry={registry}
        placements={items}
        loaders={loaders}
        className={className}
      />
    </AdminI18nProvider>
  );
}

/** Long enough for any effect a rerender wrongly triggered to run to completion. */
function settle() {
  return new Promise((resolve) => setTimeout(resolve, 60));
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

  it("loads a tile once for a settled mount, however often the grid rerenders", async () => {
    // The loaders are written inline in the caller's render, which is what a loaders prop looks like
    // in real code: a fresh closure every time. `useAdminWidgetData` reloads when the load function's
    // identity changes, so a tile that memoized on that closure answers every rerender of the host's
    // page with a refetch, and a dashboard turns into a request storm the moment anything above it
    // holds state. The count is asserted exactly, because a bound cannot tell one extra load per
    // rerender from a settled mount.
    const calls = { p0: 0, p1: 0 };
    const loaders = () => ({
      p0: async () => {
        calls.p0 += 1;
        return { total: 9 };
      },
      p1: async () => {
        calls.p1 += 1;
        return { total: 2 };
      },
    });
    // The arrangement is rebuilt as well, and for the same reason: a host that reads it from a store
    // gets a fresh array of fresh objects on each render, and a tile memoizing on any of them would
    // reload exactly as it does on a new closure. The tiles are keyed by placement id, so this
    // rerenders them rather than replacing them.
    const arrangement = () => placements.map((placement) => ({ ...placement }));

    const { rerender } = render(<Harness loaders={loaders()} items={arrangement()} />);
    await waitFor(() => expect(screen.getByText("9 signups")).toBeInTheDocument());
    expect(calls).toEqual({ p0: 1, p1: 1 });

    for (let round = 0; round < 3; round += 1) {
      rerender(
        <Harness loaders={loaders()} items={arrangement()} className={`mt-${round + 2}`} />,
      );
    }
    await settle();

    expect(calls).toEqual({ p0: 1, p1: 1 });
    // Still showing what it loaded, so this is a grid that stopped asking rather than one that gave up.
    expect(screen.getByText("9 signups")).toBeInTheDocument();
  });

  it("runs the loader the caller last handed when a failed tile is retried", async () => {
    // A tile's load function is built once, so a caller that swaps a loader mid-life is not
    // refetched behind its back. The retry is the path that picks the newer loader up, and it has
    // to pick up the new one rather than the one the tile mounted with.
    const user = userEvent.setup();
    const failing = vi.fn().mockRejectedValue(new Error("upstream down"));
    const recovered = vi.fn().mockResolvedValue({ total: 4 });

    const { rerender } = render(<Harness loaders={{ p0: never, p1: failing }} />);
    await waitFor(() => expect(screen.getByText("upstream down")).toBeInTheDocument());

    rerender(<Harness loaders={{ p0: never, p1: recovered }} />);
    await settle();
    expect(recovered).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(screen.getByText("4 signups")).toBeInTheDocument());
    expect(recovered).toHaveBeenCalledTimes(1);
  });
});

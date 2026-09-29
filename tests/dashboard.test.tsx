// SPDX-License-Identifier: MIT
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AdminI18nProvider } from "../src/i18n";
import {
  adminDashboardAddPlacement,
  adminDashboardCollection,
  adminDashboardRemoveAt,
  adminDashboardSetSize,
  adminDashboardValidate,
  type AdminDashboard,
} from "../src/dashboard/model";
import { AdminDashboardLayout, dashboardGridClassName } from "../src/dashboard/layout";
import { createAdminWidgetRegistry, defineAdminWidget } from "../src/widgets/registry";
import type { AdminWidgetDefinition } from "../src/widgets/types";

const counter = defineAdminWidget<{ total: number }>({
  id: "counter",
  title: "Signups",
  sizes: ["sm", "md", "lg"],
  isEmpty: (data) => data.total === 0,
  render: (data) => <p>{data.total} signups</p>,
});

const chart = defineAdminWidget<{ points: number[] }>({
  id: "chart",
  title: "Revenue",
  sizes: ["lg", "xl"],
  render: (data) => <p>{data.points.length} points</p>,
});

const registry = createAdminWidgetRegistry({ counter, chart });

function dashboard(...pairs: Array<[string, "sm" | "md" | "lg" | "xl"]>): AdminDashboard {
  return {
    name: "overview",
    placements: pairs.map(([widget, size], index) => ({ id: `p${index}`, widget, size })),
  };
}

/** A child component, so the layout's dictionary read happens inside the provider rather than beside it. */
function Harness(props: Parameters<typeof AdminDashboardLayout>[0]) {
  return (
    <AdminI18nProvider locale="en">
      <AdminDashboardLayout {...props} />
    </AdminI18nProvider>
  );
}

describe("adminDashboardAddPlacement", () => {
  it("adds a tile at the widget's smallest supported size", () => {
    // The caller does not choose a size, because naming a size the widget rejects produces a
    // dashboard that cannot render.
    const next = adminDashboardAddPlacement(dashboard(), registry, "chart");

    expect(next.placements).toHaveLength(1);
    expect(next.placements[0].widget).toBe("chart");
    expect(next.placements[0].size).toBe("lg");
  });

  it("refuses a widget that is not registered", () => {
    expect(() => adminDashboardAddPlacement(dashboard(), registry, "ghost")).toThrow(/no such widget/);
  });

  it("gives every added tile its own identity", () => {
    const once = adminDashboardAddPlacement(dashboard(), registry, "counter");
    const twice = adminDashboardAddPlacement(once, registry, "counter");

    // A shared id would make reordering apply to whichever tile came first.
    expect(new Set(twice.placements.map((p) => p.id)).size).toBe(2);
  });
});

describe("adminDashboardSetSize", () => {
  it("resizes a tile to a size the widget supports", () => {
    const next = adminDashboardSetSize(dashboard(["counter", "sm"]), registry, 0, "lg");

    expect(next.placements[0].size).toBe("lg");
  });

  it("leaves the tile alone when the widget does not support the size", () => {
    // Storing it anyway would persist a tile that cannot be rendered, which is reachable from a
    // hand-edited request or a stale editor.
    const before = dashboard(["counter", "sm"]);
    const next = adminDashboardSetSize(before, registry, 0, "xl");

    expect(next).toBe(before);
  });

  it("ignores an index that is not a tile", () => {
    const before = dashboard(["counter", "sm"]);

    expect(adminDashboardSetSize(before, registry, 5, "lg")).toBe(before);
  });

  it("ignores a resize to the size the tile already has", () => {
    const before = dashboard(["counter", "sm"]);

    expect(adminDashboardSetSize(before, registry, 0, "sm")).toBe(before);
  });
});

describe("adminDashboardRemoveAt", () => {
  it("removes the tile at an index", () => {
    const next = adminDashboardRemoveAt(dashboard(["counter", "sm"], ["chart", "lg"]), 0);

    expect(next.placements).toHaveLength(1);
    expect(next.placements[0].widget).toBe("chart");
  });

  it("ignores an index that is not a tile", () => {
    const before = dashboard(["counter", "sm"]);

    expect(adminDashboardRemoveAt(before, 9)).toBe(before);
  });
});

describe("adminDashboardValidate", () => {
  it("reports no problems for a dashboard the registry accepts", () => {
    expect(adminDashboardValidate(registry, dashboard(["counter", "sm"], ["chart", "xl"]).placements).size).toBe(0);
  });

  it("reports an unsupported size against the tile that has it", () => {
    const problems = adminDashboardValidate(registry, dashboard(["counter", "xl"]).placements);

    expect(problems.get("p0")).toEqual([
      'Widget "counter" does not support the size "xl". It supports sm, md, lg',
    ]);
  });

  it("reports a tile that has no widget chosen yet", () => {
    const problems = adminDashboardValidate(registry, [{ id: "p0", widget: "", size: "sm" }]);

    expect(problems.get("p0")).toEqual(["This tile has no widget yet"]);
  });

  it("reports a widget this build no longer registers", () => {
    // A dashboard persisted by an earlier release can name a widget that has since been dropped.
    const problems = adminDashboardValidate(registry, dashboard(["ghost", "sm"]).placements);

    expect(problems.get("p0")).toEqual(['No widget is registered as "ghost"']);
  });
});

describe("adminDashboardCollection", () => {
  it("validates a placement the same way the dashboard does", () => {
    // The editor takes its validation from here, so the editor and the renderer cannot disagree
    // about whether a tile is renderable.
    const definition = adminDashboardCollection(registry);

    expect(definition.validate({ id: "p0", widget: "counter", size: "md" })).toEqual([]);
    expect(definition.validate({ id: "p0", widget: "counter", size: "xl" })).toHaveLength(1);
  });

  it("declares the two fields a placement is made of", () => {
    expect(adminDashboardCollection(registry).fields.map((f) => f.name)).toEqual(["widget", "size"]);
  });

  it("creates an unplaced tile rather than inventing a widget", () => {
    const created = adminDashboardCollection(registry).create();

    expect(created.widget).toBe("");
    expect(adminDashboardCollection(registry).validate({ id: "p0", ...created })).toEqual([
      "This tile has no widget yet",
    ]);
  });
});

describe("AdminDashboardLayout", () => {
  it("renders a widget's data at the size it was placed at", () => {
    render(
      <Harness
        registry={registry}
        placements={dashboard(["counter", "md"]).placements}
        states={{ p0: { status: "ready", data: { total: 12 } } }}
      />,
    );

    const tile = document.querySelector("[data-placement='p0']");
    expect(tile).not.toBeNull();
    expect(screen.getByText("12 signups")).toBeInTheDocument();
  });

  it("lays out on a responsive grid rather than absolute positioning", () => {
    render(<Harness registry={registry} placements={[]} states={{}} />);

    // A positioning library would position tiles with inline coordinates. Grid keeps the dashboard
    // server-renderable, which is the reason that dependency was declined.
    expect(dashboardGridClassName).toContain("grid-cols-1");
    expect(dashboardGridClassName).toContain("md:grid-cols-2");
    expect(dashboardGridClassName).toContain("lg:grid-cols-4");
  });

  it("gives every size a literal class, so the width is compiled rather than guessed", () => {
    // A computed `col-span-${n}` produces no CSS at all and fails silently at run time.
    for (const [placement, expected] of [
      ["sm", "md:col-span-1"],
      ["md", "md:col-span-2"],
      ["lg", "lg:col-span-3"],
      ["xl", "lg:col-span-4"],
    ] as const) {
      const { unmount } = render(
        <Harness
          registry={registry}
          placements={dashboard(["counter", placement]).placements}
          states={{ p0: { status: "ready", data: { total: 1 } } }}
        />,
      );
      const tile = document.querySelector("[data-placement='p0']");
      expect(tile?.className).toContain(expected);
      unmount();
    }
  });

  it("names a widget the build no longer has, instead of leaving a hole", () => {
    render(
      <Harness
        registry={registry}
        placements={dashboard(["ghost", "sm"]).placements}
        states={{}}
      />,
    );

    expect(
      screen.getByText('This dashboard refers to a widget called "ghost", which this build does not provide.'),
    ).toBeInTheDocument();
  });

  it("keeps the tiles around a missing widget working", () => {
    // One stale row must not cost the dashboard that still renders.
    render(
      <Harness
        registry={registry}
        placements={dashboard(["ghost", "sm"], ["counter", "sm"]).placements}
        states={{ p1: { status: "ready", data: { total: 4 } } }}
      />,
    );

    expect(screen.getByText("4 signups")).toBeInTheDocument();
  });

  it("shows a loading state for a tile whose data has not arrived", () => {
    render(<Harness registry={registry} placements={dashboard(["counter", "sm"]).placements} states={{}} />);

    // Absent rather than `ready` with nothing, so a tile that never resolves cannot read as empty.
    expect(document.querySelector("[data-widget-state='loading']")).not.toBeNull();
  });

  it("retries only the tile that failed", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <Harness
        registry={registry}
        placements={dashboard(["counter", "sm"], ["chart", "lg"]).placements}
        states={{ p0: { status: "error", error: new Error("boom") }, p1: { status: "ready", data: { points: [1] } } }}
        onRetry={onRetry}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry.mock.calls[0][0]).toMatchObject({ id: "p0", widget: "counter" });
  });

  it("shows an empty dashboard rather than a blank grid", () => {
    render(<Harness registry={registry} placements={[]} states={{}} />);

    expect(screen.getByText("This dashboard has no widgets yet.")).toBeInTheDocument();
  });
});

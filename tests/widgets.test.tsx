// SPDX-License-Identifier: MIT
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AdminI18nProvider } from "../src/i18n";
import {
  adminWidgetState,
  createAdminWidgetRegistry,
  defineAdminWidget,
} from "../src/widgets/registry";
import { AdminWidget } from "../src/widgets/render";
import type { AdminWidgetDefinition } from "../src/widgets/types";

type Count = { total: number };

const counter = defineAdminWidget<Count>({
  id: "counter",
  title: "Signups",
  sizes: ["sm", "lg"],
  isEmpty: (data) => data.total === 0,
  render: (data) => <p>{data.total} signups</p>,
});

type WidgetState =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "error"; error: Error }
  | { status: "ready"; data: Count };

/**
 * A child component, because `AdminWidget` reads a hook. Written inline in the provider's JSX
 * it is evaluated during the parent's render, which is outside the provider, and every assertion then
 * quietly matched the default Turkish dictionary instead of the English one it asked for.
 */
function Widget({
  definition,
  state,
  onRetry,
}: {
  definition: AdminWidgetDefinition<Count>;
  state: WidgetState;
  onRetry?: () => void;
}) {
  return <AdminWidget definition={definition} state={state} onRetry={onRetry} />;
}

function Harness({
  definition = counter,
  state,
  onRetry,
}: {
  definition?: AdminWidgetDefinition<Count>;
  state: WidgetState;
  onRetry?: () => void;
}) {
  return (
    <AdminI18nProvider locale="en">
      <Widget definition={definition} state={state} onRetry={onRetry} />
    </AdminI18nProvider>
  );
}

describe("defineAdminWidget", () => {
  it("returns the definition unchanged", () => {
    expect(defineAdminWidget(counter)).toBe(counter);
  });

  it("refuses a widget with no id, which a persisted dashboard could not refer to", () => {
    expect(() => defineAdminWidget({ id: "", title: "t", sizes: ["sm"], render: () => null })).toThrow(
      /needs an id/,
    );
  });

  it("refuses a widget that supports no size, which could never be placed", () => {
    expect(() => defineAdminWidget({ id: "w", title: "t", sizes: [], render: () => null })).toThrow(
      /supports no sizes/,
    );
  });

  it("refuses an unknown size rather than storing one the layout cannot satisfy", () => {
    expect(() =>
      defineAdminWidget({
        id: "w",
        title: "t",
        sizes: ["huge" as never],
        render: () => null,
      }),
    ).toThrow(/unknown size/);
  });
});

describe("adminWidgetState", () => {
  it("reads emptiness from the widget rather than inferring it from the data", () => {
    // A total of zero is empty for this widget and ready for any widget that counts nothing.
    expect(adminWidgetState(counter, { total: 0 })).toEqual({ status: "empty" });
    expect(adminWidgetState(counter, { total: 3 })).toEqual({ status: "ready", data: { total: 3 } });
  });

  it("treats data as ready when the widget declares no emptiness rule", () => {
    const opaque = defineAdminWidget<{ rows: number }>({
      id: "opaque",
      title: "Opaque",
      sizes: ["md"],
      render: () => null,
    });

    expect(adminWidgetState(opaque, { rows: 0 })).toEqual({ status: "ready", data: { rows: 0 } });
  });
});

describe("createAdminWidgetRegistry", () => {
  const other = defineAdminWidget<Count>({
    id: "revenue",
    title: "Revenue",
    sizes: ["lg"],
    render: () => null,
  });

  it("lists widgets in registration order, which is the order an editor offers them", () => {
    expect(createAdminWidgetRegistry({ counter, revenue: other }).list().map((w) => w.id)).toEqual([
      "counter",
      "revenue",
    ]);
  });

  it("refuses a widget registered under a key other than its own id", () => {
    // A registry that lists a widget under one key and answers another is the defect worth stopping
    // for, and the keyed form is the only one where the two can disagree.
    expect(() => createAdminWidgetRegistry({ wrongKey: counter })).toThrow(
      /registered as "wrongKey" declares the id "counter"/,
    );
  });

  it("accepts a list of differently-typed widgets, which is how a host holds its plugins", () => {
    // The keyed form cannot express this: `AdminWidgetDefinition<never>` is a contravariant
    // constraint, so an array mixing widgets whose data types differ is not assignable to it. A host
    // assembling widgets in a list is ordinary, and rejecting it pushes them to cast.
    const registry = createAdminWidgetRegistry([counter, other]);

    expect(registry.list().map((w) => w.id)).toEqual(["counter", "revenue"]);
    expect(registry.validate({ widget: "counter", size: "lg" })).toEqual([]);
  });

  it("refuses two widgets sharing an id in a list, which would make a saved dashboard ambiguous", () => {
    expect(() => createAdminWidgetRegistry([counter, counter])).toThrow(/both registered/);
  });

  it("accepts an empty registry in both forms", () => {
    expect(createAdminWidgetRegistry().list()).toEqual([]);
    expect(createAdminWidgetRegistry([]).list()).toEqual([]);
  });

  it("finds a widget by id and reports an unknown one as absent", () => {
    const registry = createAdminWidgetRegistry({ counter });

    expect(registry.get("counter")).toBe(counter);
    expect(registry.has("revenue")).toBe(false);
  });

  it("returns nothing for an id the list form cannot rule out at compile time", () => {
    // A dashboard persisted by an earlier release can name a widget this build no longer registers.
    // The keyed form stops that question being asked, so the list form is where the runtime miss has
    // to be answerable rather than thrown, since the editor looks every persisted id up.
    expect(createAdminWidgetRegistry([counter]).get("revenue")).toBeUndefined();
    expect(createAdminWidgetRegistry([]).get("revenue")).toBeUndefined();
  });

  it("reports an unregistered widget instead of dropping it from a saved dashboard", () => {
    expect(createAdminWidgetRegistry({ counter }).validate({ widget: "ghost", size: "sm" })).toEqual([
      'No widget is registered as "ghost"',
    ]);
  });

  it("reports a size the widget does not support, and names the ones it does", () => {
    expect(createAdminWidgetRegistry({ counter }).validate({ widget: "counter", size: "xl" })).toEqual([
      'Widget "counter" does not support the size "xl". It supports sm, lg',
    ]);
  });

  it("accepts a placement the widget supports", () => {
    expect(createAdminWidgetRegistry({ counter }).validate({ widget: "counter", size: "lg" })).toEqual([]);
  });

  it("validates an empty registry by reporting every widget as unregistered", () => {
    expect(createAdminWidgetRegistry().list()).toEqual([]);
    expect(createAdminWidgetRegistry().validate({ widget: "counter", size: "sm" })).toHaveLength(1);
  });
});

describe("renderAdminWidget", () => {
  it("shows a skeleton while the data is in flight", () => {
    render(<Harness state={{ status: "loading" }} />);

    expect(screen.getByText("Signups")).toBeInTheDocument();
    expect(document.querySelector("[data-widget-state='loading']")).not.toBeNull();
  });

  it("shows the data when ready", () => {
    render(<Harness state={adminWidgetState(counter, { total: 7 })} />);

    expect(screen.getByText("7 signups")).toBeInTheDocument();
  });

  it("shows an empty state that is not the error state", () => {
    render(<Harness state={adminWidgetState(counter, { total: 0 })} />);

    expect(screen.getByText("Nothing to show")).toBeInTheDocument();
    expect(screen.queryByText("This widget could not load")).not.toBeInTheDocument();
  });

  it("shows a failure with its message, so the widget does not read as empty", () => {
    render(<Harness state={{ status: "error", error: new Error("upstream timed out") }} />);

    expect(screen.getByText("upstream timed out")).toBeInTheDocument();
    expect(screen.queryByText("Nothing to show")).not.toBeInTheDocument();
  });

  it("offers a retry that reaches the host, because a failure the user cannot retry is a dead end", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<Harness state={{ status: "error", error: new Error("boom") }} onRetry={onRetry} />);

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("omits the retry control when the host supplied no way to retry", () => {
    render(<Harness state={{ status: "error", error: new Error("boom") }} />);

    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("prefers a widget's own state renderers over the engine defaults", () => {
    const chatty = defineAdminWidget<Count>({
      id: "chatty",
      title: "Chatty",
      sizes: ["sm"],
      render: () => <p>ready body</p>,
      renderLoading: () => <p>hold on</p>,
      renderEmpty: () => <p>no rows</p>,
      renderError: (error) => <p>failed: {error.message}</p>,
    });

    render(<Harness definition={chatty} state={{ status: "loading" }} />);
    expect(screen.getByText("hold on")).toBeInTheDocument();
  });

  it("names the widget for assistive technology even when it is not showing data", () => {
    render(<Harness state={{ status: "loading" }} />);

    // The dashboard's outline should survive a widget that is loading or failed, or a screen
    // reader user loses the shape of the page exactly when it is least useful.
    expect(screen.getByRole("region", { name: "Signups" })).toBeInTheDocument();
  });
});

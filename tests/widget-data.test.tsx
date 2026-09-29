// SPDX-License-Identifier: MIT
import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { adminWidgetLoadAll, useAdminWidgetData, type AdminWidgetLoader } from "../src/widgets/data";
import { defineAdminWidget } from "../src/widgets/registry";

type Row = { total: number };

const counter = defineAdminWidget<Row>({
  id: "counter",
  title: "Signups",
  sizes: ["sm"],
  isEmpty: (data) => data.total === 0,
  render: (data) => <p>{data.total} signups</p>,
});

/** A promise the test resolves by hand, so ordering is decided rather than raced. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function Probe({ load, definition = counter }: { load: AdminWidgetLoader<Row>; definition?: typeof counter }) {
  const { state, refetch, isRefreshing } = useAdminWidgetData({ definition, load });
  return (
    <div>
      <p>status: {state.status}</p>
      {state.status === "ready" ? <p>total: {state.data.total}</p> : null}
      {state.status === "error" ? <p>error: {state.error.message}</p> : null}
      <p>stale: {String(state.status === "ready" && state.stale === true)}</p>
      <p>refreshing: {String(isRefreshing)}</p>
      <button type="button" onClick={refetch}>
        Refetch
      </button>
    </div>
  );
}

describe("useAdminWidgetData", () => {
  it("shows loading, then the data", async () => {
    const gate = deferred<Row>();
    render(<Probe load={() => gate.promise} />);

    expect(screen.getByText("status: loading")).toBeInTheDocument();
    await act(async () => gate.resolve({ total: 7 }));
    expect(screen.getByText("total: 7")).toBeInTheDocument();
  });

  it("reads emptiness from the widget, so a loaded but empty widget is empty", async () => {
    const gate = deferred<Row>();
    render(<Probe load={() => gate.promise} />);

    await act(async () => gate.resolve({ total: 0 }));

    expect(screen.getByText("status: empty")).toBeInTheDocument();
  });

  it("keeps showing the previous data while a refetch is in flight", async () => {
    // A widget that blanks itself on every background refresh is worse than one briefly out of date.
    const first = deferred<Row>();
    const second = deferred<Row>();
    const loads = [first, second];
    let call = 0;
    render(<Probe load={() => loads[call++].promise} />);

    await act(async () => first.resolve({ total: 5 }));
    expect(screen.getByText("total: 5")).toBeInTheDocument();

    await act(async () => {
      screen.getByRole("button", { name: "Refetch" }).click();
    });

    // Still the old number, marked stale, and flagged as refreshing.
    expect(screen.getByText("total: 5")).toBeInTheDocument();
    expect(screen.getByText("stale: true")).toBeInTheDocument();
    expect(screen.getByText("refreshing: true")).toBeInTheDocument();

    await act(async () => second.resolve({ total: 9 }));
    expect(screen.getByText("total: 9")).toBeInTheDocument();
    expect(screen.getByText("stale: false")).toBeInTheDocument();
  });

  it("ignores a slow first load that a refetch has already overtaken", async () => {
    // Two requests racing, and the older one resolving last, must not win.
    const first = deferred<Row>();
    const second = deferred<Row>();
    const loads = [first, second];
    let call = 0;
    render(<Probe load={() => loads[call++].promise} />);

    await act(async () => {
      screen.getByRole("button", { name: "Refetch" }).click();
    });
    await act(async () => second.resolve({ total: 2 }));
    expect(screen.getByText("total: 2")).toBeInTheDocument();

    // The stale first answer arrives afterwards and must be discarded.
    await act(async () => first.resolve({ total: 99 }));
    expect(screen.getByText("total: 2")).toBeInTheDocument();
    expect(screen.queryByText("total: 99")).not.toBeInTheDocument();
  });

  it("reports a failure as an error, not as an empty widget", async () => {
    const gate = deferred<Row>();
    render(<Probe load={() => gate.promise} />);

    await act(async () => gate.reject(new Error("upstream down")));

    expect(screen.getByText("error: upstream down")).toBeInTheDocument();
    expect(screen.getByText("status: error")).toBeInTheDocument();
  });

  it("recovers on refetch after a failure", async () => {
    const gate = deferred<Row>();
    const recover = deferred<Row>();
    const loads = [gate, recover];
    let call = 0;
    render(<Probe load={() => loads[call++].promise} />);

    await act(async () => gate.reject(new Error("down")));
    expect(screen.getByText("status: error")).toBeInTheDocument();

    await act(async () => {
      screen.getByRole("button", { name: "Refetch" }).click();
    });
    await act(async () => recover.resolve({ total: 3 }));

    expect(screen.getByText("total: 3")).toBeInTheDocument();
  });

  it("aborts the request it gave up on, so it stops consuming the host's connection", async () => {
    const first = deferred<Row>();
    const second = deferred<Row>();
    const signals: AbortSignal[] = [];
    const loads = [first, second];
    let call = 0;
    render(
      <Probe
        load={(signal) => {
          signals.push(signal);
          return loads[call++].promise;
        }}
      />,
    );

    await act(async () => {
      screen.getByRole("button", { name: "Refetch" }).click();
    });

    expect(signals).toHaveLength(2);
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
  });

  it("does not touch state after the widget is gone", async () => {
    // React no longer warns on this, so a failure here is silent. The console spy is the check.
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const gate = deferred<Row>();
    const { unmount } = render(<Probe load={() => gate.promise} />);

    unmount();
    await act(async () => gate.resolve({ total: 1 }));
    await act(async () => gate.reject(new Error("late failure")));

    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it("reports a non-Error rejection rather than rendering a broken message", async () => {
    // A loader that rejects with a string is common enough in JavaScript that the engine cannot
    // assume it received an Error.
    const gate = deferred<Row>();
    render(<Probe load={() => gate.promise} />);

    await act(async () => gate.reject("just a string"));

    expect(screen.getByText("status: error")).toBeInTheDocument();
    expect(screen.getByText(/just a string/)).toBeInTheDocument();
  });

  it("does not report an abort as a failure, because it is the widget giving up", async () => {
    // A refetch aborts the request it supersedes, and a well-behaved loader rejects with an
    // AbortError when that happens. Showing an error for it would put a failure on a widget that was
    // merely replaced, which is worse than showing nothing.
    const calls: Array<{ signal: AbortSignal; reject: (error: unknown) => void }> = [];
    const ok = deferred<Row>();
    const never = deferred<Row>();
    let call = 0;
    render(
      <Probe
        load={(signal) => {
          const gate = call++ === 0 ? never : ok;
          calls.push({ signal, reject: gate.reject });
          return gate.promise;
        }}
      />,
    );

    await act(async () => {
      screen.getByRole("button", { name: "Refetch" }).click();
    });
    // Asserted before the rejection, so the test cannot pass without the abort actually happening.
    expect(calls[0].signal.aborted).toBe(true);
    // The superseded request is now aborted, so its loader rejects the way a real one would.
    await act(async () => calls[0].reject(new DOMException("aborted", "AbortError")));

    expect(screen.queryByText(/status: error/)).not.toBeInTheDocument();

    await act(async () => ok.resolve({ total: 4 }));
    expect(screen.getByText("total: 4")).toBeInTheDocument();
  });

  it("does not load when disabled", async () => {
    const load = vi.fn().mockResolvedValue({ total: 1 });
    function Disabled() {
      useAdminWidgetData({ definition: counter, load, enabled: false });
      return null;
    }
    render(<Disabled />);

    await waitFor(() => expect(load).not.toHaveBeenCalled());
  });
});

describe("adminWidgetLoadAll", () => {
  it("keeps the widgets that succeeded when one fails", async () => {
    // Promise.all would discard every resolved answer because of one rejection, which is the whole
    // failure mode this function exists to avoid.
    const states = await adminWidgetLoadAll<Row>([
      { id: "a", load: async () => ({ total: 1 }) },
      { id: "b", load: async () => Promise.reject(new Error("b failed")) },
      { id: "c", load: async () => ({ total: 3 }) },
    ]);

    expect(states.a).toEqual({ status: "ready", data: { total: 1 } });
    expect(states.c).toEqual({ status: "ready", data: { total: 3 } });
    expect(states.b.status).toBe("error");
  });

  it("does not let one rejection escape as an unhandled rejection", async () => {
    const states = await adminWidgetLoadAll<Row>([
      { id: "a", load: async () => Promise.reject(new Error("boom")) },
    ]);

    expect(states.a.status).toBe("error");
  });
});

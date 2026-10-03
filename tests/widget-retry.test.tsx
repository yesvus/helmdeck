// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { adminWidgetBody } from "../src/widgets/body";
import { AdminWidgetPermanentError, adminWidgetRetryIsWorthwhile } from "../src/widgets/retry";
import { AdminPermissionDeniedError, AdminUnauthenticatedError } from "../src/shell/permission-rule";
import { AdminTenantError } from "../src/baseline/tenant-core";
import type { ReactNode } from "react";
import type { AdminMessages } from "../src/i18n";
import type { AdminWidgetDefinition } from "../src/widgets/types";

const messages = {
  widget: {
    emptyTitle: "Nothing yet",
    emptyBody: "Nothing here",
    errorTitle: "Could not load",
    retry: "Try again",
  },
} as Pick<AdminMessages, "widget">;

const definition: AdminWidgetDefinition<number> = {
  id: "orders",
  title: "Orders",
  sizes: ["md"],
  render: () => null,
};

/** The same definition with a host-supplied error view, which is the path that takes a callback. */
const withErrorView = (renderError: (error: Error, onRetry: () => void) => ReactNode) => ({
  ...definition,
  renderError,
});

describe("adminWidgetRetryIsWorthwhile", () => {
  it("says no for the refusals this package already raises", () => {
    // These are the errors a host gets from the package's own permission rule and store, without
    // knowing this function exists. Retrying them asks the same question of the same rule and gets the
    // same answer, which is why they are listed here rather than left to a host to classify.
    expect(adminWidgetRetryIsWorthwhile(new AdminUnauthenticatedError("orders.read"))).toBe(false);
    expect(
      adminWidgetRetryIsWorthwhile(
        new AdminPermissionDeniedError({
          permission: "orders.read",
          reason: "denied",
          session: null,
        }),
      ),
    ).toBe(false);
    expect(adminWidgetRetryIsWorthwhile(new AdminTenantError("Reading orders needs a tenant"))).toBe(false);
  });

  it("says no for a refusal a host declares permanent", () => {
    const error = new AdminWidgetPermanentError("Stripe is not configured", "Add STRIPE_SECRET_KEY.");
    expect(adminWidgetRetryIsWorthwhile(error)).toBe(false);
    expect(error.remedy).toBe("Add STRIPE_SECRET_KEY.");
  });

  it("says yes for anything it does not recognise, because a dead end is worse than a wasted click", () => {
    // A database that was briefly unreachable arrives as a plain Error. Refusing to retry it would
    // leave the operator with no way forward at all, and the cost of being wrong is one wasted click.
    expect(adminWidgetRetryIsWorthwhile(new Error("ECONNRESET"))).toBe(true);
    expect(adminWidgetRetryIsWorthwhile(new TypeError("x is not a function"))).toBe(true);
  });

  it("carries the cause through, so a refusal does not lose what it came from", () => {
    const cause = new Error("no session");
    const error = new AdminWidgetPermanentError("Refused", "Sign in.", { cause });
    expect(error.cause).toBe(cause);
    expect(error).toBeInstanceOf(Error);
  });
});

describe("a widget failure and its retry control", () => {
  it("offers retry for a transient failure, because repeating could work", () => {
    render(
      <div>
        {adminWidgetBody({
          definition,
          state: { status: "error", error: new Error("ECONNRESET") },
          messages,
          onRetry: () => {},
        })}
      </div>,
    );

    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("offers no retry for a refusal that cannot be retried away", () => {
    // The defect this fixes: the tile passed `refetch` unconditionally, so a permanent refusal
    // rendered a button that re-runs the same failing load and fails identically.
    render(
      <div>
        {adminWidgetBody({
          definition,
          state: { status: "error", error: new AdminTenantError("Reading orders needs a tenant") },
          messages,
          onRetry: () => {},
        })}
      </div>,
    );

    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("says what to do instead, so a refusal is not a dead end", () => {
    render(
      <div>
        {adminWidgetBody({
          definition,
          state: {
            status: "error",
            error: new AdminWidgetPermanentError("Stripe is not configured", "Add STRIPE_SECRET_KEY."),
          },
          messages,
          onRetry: () => {},
        })}
      </div>,
    );

    expect(screen.getByText(/Stripe is not configured/)).toBeTruthy();
    expect(screen.getByText(/Add STRIPE_SECRET_KEY\./)).toBeTruthy();
  });

  it("still lets a host's own renderError see the error, with an inert retry for a permanent one", () => {
    const seen: string[] = [];
    const rendered = adminWidgetBody({
      definition: withErrorView((error, onRetry) => {
        seen.push(error.message);
        return (
          <button type="button" onClick={onRetry}>
            custom
          </button>
        );
      }),
      state: { status: "error", error: new AdminWidgetPermanentError("nope", "do the thing") },
      messages,
      onRetry: () => seen.push("retried"),
    });

    render(<div>{rendered}</div>);
    screen.getByRole("button", { name: "custom" }).click();

    // The definition is handed the error either way, and the callback it was given does nothing,
    // because the host chose to render a control and the engine cannot stop that. It can only decline
    // to hand over a working one.
    expect(seen).toEqual(["nope"]);
  });

  it("hands a definition a working retry when the failure was transient", () => {
    const seen: string[] = [];
    render(
      <div>
        {adminWidgetBody({
          definition: withErrorView((_error, onRetry) => (
            <button type="button" onClick={onRetry}>
              custom
            </button>
          )),
          state: { status: "error", error: new Error("ECONNRESET") },
          messages,
          onRetry: () => seen.push("retried"),
        })}
      </div>,
    );

    screen.getByRole("button", { name: "custom" }).click();
    expect(seen).toEqual(["retried"]);
  });

  it("offers no retry when the host supplied none, whatever the failure", () => {
    render(
      <div>
        {adminWidgetBody({
          definition,
          state: { status: "error", error: new Error("ECONNRESET") },
          messages,
        })}
      </div>,
    );

    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("lets a host override the classification rather than editing it", () => {
    const retryIsWorthwhile = vi.fn(() => false);
    render(
      <div>
        {adminWidgetBody({
          definition,
          state: { status: "error", error: new Error("ECONNRESET") },
          messages,
          onRetry: () => {},
          retryIsWorthwhile,
        })}
      </div>,
    );

    expect(retryIsWorthwhile).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });
});

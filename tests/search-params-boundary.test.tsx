// SPDX-License-Identifier: MIT
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminManagedForm } from "../src/primitives/managed-form";
import { AdminUrlFeedback } from "../src/primitives/url-feedback";

const navigation = vi.hoisted(() => ({
  params: new URLSearchParams() as URLSearchParams | null,
  replace: vi.fn(),
}));

vi.mock("next/navigation.js", () => ({
  usePathname: () => "/admin/products",
  useRouter: () => ({ replace: navigation.replace, push: vi.fn() }),
  useSearchParams: () => navigation.params,
}));

afterEach(() => {
  navigation.params = new URLSearchParams();
  vi.useRealTimers();
});

/**
 * Next yields no search params while prerendering a page that has no Suspense boundary.
 * Reproduce that here so the guard is exercised the way a static build hits it.
 */
function withoutSearchParams() {
  navigation.params = null;
}

describe("components that read search params", () => {
  it("renders AdminUrlFeedback with a boundary", () => {
    navigation.params = new URLSearchParams("message=Saved&status=success");
    render(<AdminUrlFeedback durationMs={100} />);

    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  // Supplying both values means nothing has to be read from the URL, so no boundary.
  it("renders without a boundary when message and assetUrl are supplied", () => {
    withoutSearchParams();
    render(<AdminUrlFeedback message="Saved" assetUrl="/logo.svg" />);

    expect(screen.getByText("Saved")).toBeInTheDocument();
    expect(screen.getByText("/logo.svg")).toBeInTheDocument();
  });

  it("still requires a boundary when only one value is supplied", () => {
    withoutSearchParams();

    expect(() => render(<AdminUrlFeedback message="Saved" />)).toThrow(/AdminUrlFeedback/);
    expect(() => render(<AdminUrlFeedback assetUrl="/logo.svg" />)).toThrow(/AdminUrlFeedback/);
  });

  it("prefers supplied values over the query string", () => {
    navigation.params = new URLSearchParams("message=FromQuery&assetUrl=/from-query.svg");
    render(<AdminUrlFeedback message="FromProps" assetUrl="/from-props.svg" />);

    expect(screen.getByText("FromProps")).toBeInTheDocument();
    expect(screen.getByText("/from-props.svg")).toBeInTheDocument();
    expect(screen.queryByText("FromQuery")).not.toBeInTheDocument();
    expect(screen.queryByText("/from-query.svg")).not.toBeInTheDocument();
  });

  it("dismisses supplied values once and does not bring them back", () => {
    vi.useFakeTimers();
    render(<AdminUrlFeedback durationMs={100} message="Saved" assetUrl="/logo.svg" />);

    expect(screen.getByText("Saved")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(100));
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
    expect(screen.queryByText("/logo.svg")).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1000));
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
  });

  it("names the component and the fix when the boundary is missing", () => {
    withoutSearchParams();

    expect(() => render(<AdminUrlFeedback />)).toThrow(/AdminUrlFeedback/);
    expect(() => render(<AdminUrlFeedback />)).toThrow(/<Suspense>/);
    expect(() => render(<AdminUrlFeedback />)).toThrow(/force-dynamic/);
  });

  it("names the component and the fix for AdminManagedForm", () => {
    withoutSearchParams();

    const action = async () => ({ status: "idle" as const });

    expect(() => render(
      <AdminManagedForm action={action}>
        <button type="submit">Save</button>
      </AdminManagedForm>,
    )).toThrow(/AdminManagedForm/);
  });

  it("renders AdminManagedForm with a boundary", () => {
    render(
      <AdminManagedForm action={async () => ({ status: "idle" as const })}>
        <button type="submit">Save</button>
      </AdminManagedForm>,
    );

    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });
});

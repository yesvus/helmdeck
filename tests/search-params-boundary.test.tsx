// SPDX-License-Identifier: MIT
import { render, screen } from "@testing-library/react";
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

  // The documented override must not be mistaken for a way to drop the boundary.
  it("still requires a boundary when message and assetUrl are supplied", () => {
    withoutSearchParams();

    expect(() => render(<AdminUrlFeedback message="Saved" assetUrl="/logo.svg" />)).toThrow(/AdminUrlFeedback/);
  });

  it("prefers supplied values over the query string", () => {
    navigation.params = new URLSearchParams("message=FromQuery");
    render(<AdminUrlFeedback message="FromProps" />);

    expect(screen.getByText("FromProps")).toBeInTheDocument();
    expect(screen.queryByText("FromQuery")).not.toBeInTheDocument();
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

// SPDX-License-Identifier: MIT
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminUrlFeedback } from "../src/primitives/url-feedback";

const navigation = vi.hoisted(() => ({
  params: new URLSearchParams("message=Saved&status=success&feedback=one&keep=yes"),
  replace: vi.fn(),
}));

vi.mock("next/navigation.js", () => ({
  usePathname: () => "/admin/products",
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => navigation.params,
}));

afterEach(() => vi.useRealTimers());

describe("AdminUrlFeedback", () => {
  it("shows URL feedback and removes only feedback parameters", () => {
    vi.useFakeTimers();
    render(<AdminUrlFeedback durationMs={100} />);

    expect(screen.getByText("Saved")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(100));
    expect(navigation.replace).toHaveBeenCalledWith("/admin/products?keep=yes", { scroll: false });
  });
});

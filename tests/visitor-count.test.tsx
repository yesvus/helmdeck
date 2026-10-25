// SPDX-License-Identifier: MIT
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminVisitorCount } from "../src/widgets/visitor-count";

describe("AdminVisitorCount", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders static value when fetchCount is omitted", () => {
    render(<AdminVisitorCount value={42} />);
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("Live visitors")).toBeInTheDocument();
    expect(screen.getByText("visitors")).toBeInTheDocument();
  });

  it("polls periodically and updates count", async () => {
    let current = 10;
    const fetchCount = vi.fn(async () => current);

    render(<AdminVisitorCount fetchCount={fetchCount} refreshIntervalMs={5000} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText("10")).toBeInTheDocument();

    current = 25;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(screen.getByText("25")).toBeInTheDocument();
  });

  it("keeps the last known count on a failed refresh", async () => {
    let fail = false;
    const fetchCount = vi.fn(async () => {
      if (fail) throw new Error("Network error");
      return 15;
    });

    render(<AdminVisitorCount fetchCount={fetchCount} refreshIntervalMs={5000} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText("15")).toBeInTheDocument();

    fail = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(screen.getByText("15")).toBeInTheDocument();
  });
});

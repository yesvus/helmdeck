// SPDX-License-Identifier: MIT
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AdminToast, toast } from "../src/primitives/toasts";

afterEach(() => {
  cleanup();
  toast.dismissAll();
});

describe("AdminToast notifications", () => {
  it("announces success and errors from the shared helper", async () => {
    render(<AdminToast />);
    toast.success("Saved");
    toast.error("Could not save");
    await waitFor(() => expect(screen.getByText("Saved")).toBeInTheDocument());
    expect(screen.getByText("Could not save")).toBeInTheDocument();
    expect(document.querySelector("[aria-live=polite]")).toBeInTheDocument();
  });

  it("updates a loading toast by its id", async () => {
    render(<AdminToast />);
    const id = toast.loading("Saving", { id: "loading-test" });
    expect(id).toBe("loading-test");
    await waitFor(() => expect(screen.getByText("Saving")).toBeInTheDocument());
    toast.success("Saved", { id: "loading-test" });
    await waitFor(() => expect(screen.queryByText("Saving")).not.toBeInTheDocument());
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  it("passes Sonner ids through to dismiss", async () => {
    render(<AdminToast />);
    const id = toast.success("Dismiss me");
    expect(typeof id).toBe("number");
    await waitFor(() => expect(screen.getByText("Dismiss me")).toBeInTheDocument());
    toast.dismiss(id);
    await waitFor(() => expect(screen.queryByText("Dismiss me")).not.toBeInTheDocument());
  });
});

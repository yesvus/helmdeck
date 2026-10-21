// SPDX-License-Identifier: MIT
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AdminCombobox } from "../src/primitives/combobox";

function options(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `option-${index}`,
    label: `Option ${index}`,
    description: `Description ${index}`,
  }));
}

describe("AdminCombobox", () => {
  it("loads the options for the term it is given", async () => {
    const user = userEvent.setup();
    const load = vi.fn(async (term: string) => (term === "a" ? options(2) : []));
    render(<AdminCombobox label="Options" load={load} />);

    await user.type(screen.getByRole("combobox", { name: "Options" }), "a");
    expect(await screen.findByRole("option", { name: /Option 0/ })).toBeInTheDocument();
    expect(load).toHaveBeenCalledWith("a", expect.any(AbortSignal));
  });

  it("moves the active option with the arrow keys and chooses it with the enter key", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<AdminCombobox label="Options" load={async () => options(3)} onSelect={onSelect} />);

    const input = screen.getByRole("combobox", { name: "Options" });
    await user.type(input, "a");
    await screen.findByRole("option", { name: /Option 0/ });

    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("option", { name: /Option 1/ })).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "option-1" }));
  });

  it("closes the list with the escape key", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<AdminCombobox label="Options" load={async () => options(1)} onOpenChange={onOpenChange} />);

    await user.type(screen.getByRole("combobox", { name: "Options" }), "a");
    await screen.findByRole("option", { name: /Option 0/ });
    await user.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("announces the loading, empty and error states", async () => {
    const user = userEvent.setup();
    const failing = vi.fn(async () => { throw new Error("The list is not available"); });
    const { unmount } = render(<AdminCombobox label="Options" load={failing} />);

    await user.type(screen.getByRole("combobox", { name: "Options" }), "a");
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("The list is not available"));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    unmount();

    const empty = render(<AdminCombobox label="Options" load={async () => []} countLabel={(count) => `${count} matches`} />);
    await user.type(empty.getByRole("combobox", { name: "Options" }), "a");
    await waitFor(() => expect(empty.getByRole("status")).toHaveTextContent("0 matches"));
  });

  it("loads again when the reader asks it to", async () => {
    const user = userEvent.setup();
    const load = vi.fn()
      .mockRejectedValueOnce(new Error("The list is not available"))
      .mockResolvedValueOnce(options(1));
    render(<AdminCombobox label="Options" load={load} />);

    await user.type(screen.getByRole("combobox", { name: "Options" }), "a");
    await screen.findByRole("alert");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("option", { name: /Option 0/ })).toBeInTheDocument();
  });

  it("lets the reader render the option", async () => {
    const user = userEvent.setup();
    render(
      <AdminCombobox
        label="Options"
        load={async () => options(1)}
        renderOption={(option) => <span>{`Custom ${option.label}`}</span>}
      />,
    );

    await user.type(screen.getByRole("combobox", { name: "Options" }), "a");
    expect(await screen.findByRole("option", { name: "Custom Option 0" })).toBeInTheDocument();
  });
});

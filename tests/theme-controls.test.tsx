import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { ThemeControls } from "../fixtures/components/theme-controls";

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("data-admin-theme");
  document.documentElement.removeAttribute("style");
});

describe("fixture theme controls", () => {
  it("switches modes by keyboard and resets editable tokens", async () => {
    const user = userEvent.setup();
    render(<ThemeControls />);
    const mode = screen.getByRole("combobox", { name: "Color mode" });
    await user.tab();
    expect(mode).toHaveFocus();
    await user.selectOptions(mode, "dark");
    expect(document.documentElement.dataset.adminTheme).toBe("dark");
    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(document.documentElement.dataset.adminTheme).toBe("light");
  });
});

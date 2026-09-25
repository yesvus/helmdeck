import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemeControls } from "../fixtures/components/theme-controls";
import { ShellThemeProvider } from "../fixtures/components/shell-theme-provider";

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("data-admin-theme");
  document.documentElement.removeAttribute("style");
  window.localStorage.removeItem("helmdeck-demo-theme");
});

function renderControls() {
  return render(<ShellThemeProvider><ThemeControls /></ShellThemeProvider>);
}

describe("fixture theme controls", () => {
  it("retains dark mode after remounting the theme editor", async () => {
    const user = userEvent.setup();
    const firstMount = renderControls();
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Color mode" })).toHaveValue("light"));
    await user.selectOptions(screen.getByRole("combobox", { name: "Color mode" }), "dark");
    await waitFor(() => expect(window.localStorage.getItem("helmdeck-demo-theme")).toBe("dark"));
    expect(document.documentElement.dataset.adminTheme).toBe("dark");

    firstMount.unmount();
    renderControls();

    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: "Color mode" })).toHaveValue("dark");
      expect(document.documentElement.dataset.adminTheme).toBe("dark");
    });
  });

  it("follows the system preference and updates when it changes", async () => {
    let matches = true;
    let onChange: ((event: MediaQueryListEvent) => void) | undefined;
    const media = {
      get matches() {
        return matches;
      },
      addEventListener: vi.fn((_type: "change", listener: (event: MediaQueryListEvent) => void) => {
        onChange = listener;
      }),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList;
    vi.spyOn(window, "matchMedia").mockReturnValue(media);
    window.localStorage.setItem("helmdeck-demo-theme", "system");

    renderControls();

    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: "Color mode" })).toHaveValue("system");
      expect(document.documentElement.dataset.adminTheme).toBe("dark");
    });

    matches = false;
    act(() => onChange?.({ matches } as MediaQueryListEvent));

    await waitFor(() => expect(document.documentElement.dataset.adminTheme).toBe("light"));
  });

  it("switches modes by keyboard and resets editable tokens", async () => {
    const user = userEvent.setup();
    renderControls();
    const mode = screen.getByRole("combobox", { name: "Color mode" });
    await user.tab();
    expect(mode).toHaveFocus();
    await user.selectOptions(mode, "dark");
    expect(document.documentElement.dataset.adminTheme).toBe("dark");
    expect(document.documentElement.style.getPropertyValue("--admin-surface")).toBe("#1c1917");
    fireEvent.change(screen.getByLabelText("Primary color"), { target: { value: "#123456" } });
    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(document.documentElement.dataset.adminTheme).toBe("light");
    expect(document.documentElement.style.getPropertyValue("--admin-brand-500")).toBe("#b45309");
    expect(document.documentElement.style.getPropertyValue("--admin-on-brand")).toBe("#ffffff");
    expect(document.documentElement.style.getPropertyValue("--admin-surface")).toBe("#ffffff");
    expect(document.documentElement.style.getPropertyValue("--admin-spacing")).toBe("1rem");
    expect(document.documentElement.style.getPropertyValue("--admin-radius")).toBe("0.75rem");
    expect(document.documentElement.style.getPropertyValue("--admin-density")).toBe("1");
  });

  it("rejects invalid imported presets with feedback", async () => {
    const user = userEvent.setup();
    renderControls();
    const input = screen.getByRole("textbox", { name: "Theme preset JSON" });
    fireEvent.change(input, { target: { value: '[{"mode":"sepia"}]' } });
    await user.click(screen.getByRole("button", { name: "Import preset" }));
    expect(screen.getByRole("status")).toHaveTextContent("Preset must be a JSON object.");
    await user.clear(input);
    fireEvent.change(input, { target: { value: '{"mode":"sepia","brand":123}' } });
    await user.click(screen.getByRole("button", { name: "Import preset" }));
    expect(screen.getByRole("status")).toHaveTextContent("Invalid value for mode.");
    expect(document.documentElement.dataset.adminTheme).toBe("light");
    fireEvent.change(input, { target: { value: '{"mode":"dark"}' } });
    await user.click(screen.getByRole("button", { name: "Import preset" }));
    expect(document.documentElement.style.getPropertyValue("--admin-surface")).toBe("#1c1917");
  });

  it("applies density to the preview and handles unavailable clipboard export", async () => {
    const user = userEvent.setup();
    renderControls();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValueOnce(new Error("blocked"));
    await user.selectOptions(screen.getByLabelText("Density"), "0.85");
    expect(document.documentElement.style.getPropertyValue("--admin-density")).toBe("0.85");
    expect(screen.getByRole("region", { name: "Live theme preview" })).toHaveStyle({ padding: "13.6px" });
    await user.click(screen.getByRole("button", { name: "Export preset" }));
    expect(screen.getByRole("status")).toHaveTextContent("Clipboard export is unavailable in this browser.");
  });
});

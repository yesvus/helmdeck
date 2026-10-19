import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemeControls } from "../fixtures/components/theme-controls";
import { AdminThemeProvider, ADMIN_THEME_BOOT_SCRIPT, ADMIN_THEME_PREFERENCE_STORAGE_KEY, useAdminTheme } from "../src/theme";
import { AdminThemePreference } from "../src/theme";
import { AdminI18nProvider } from "../src/i18n";
import ThemePage from "../fixtures/app/(helmdeck)/theme/page";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.documentElement.removeAttribute("data-admin-theme");
  document.documentElement.removeAttribute("style");
  window.localStorage.removeItem(ADMIN_THEME_PREFERENCE_STORAGE_KEY);
  window.localStorage.removeItem("helmdeck-demo-theme");
});

function renderControls() {
  return render(<AdminThemeProvider><ThemeControls /></AdminThemeProvider>);
}

describe("theme boot script", () => {
  function runBoot() {
    new Function(ADMIN_THEME_BOOT_SCRIPT)();
  }

  afterEach(() => {
    document.documentElement.removeAttribute("data-admin-theme");
    vi.restoreAllMocks();
  });

  it("applies the stored preference before hydration", () => {
    window.localStorage.setItem(ADMIN_THEME_PREFERENCE_STORAGE_KEY, "dark");
    runBoot();

    expect(document.documentElement.dataset.adminTheme).toBe("dark");
  });

  it("migrates the fixture preference key before applying the theme", () => {
    window.localStorage.setItem("helmdeck-demo-theme", "dark");
    runBoot();

    expect(document.documentElement.dataset.adminTheme).toBe("dark");
    expect(window.localStorage.getItem(ADMIN_THEME_PREFERENCE_STORAGE_KEY)).toBe("dark");
    expect(window.localStorage.getItem("helmdeck-demo-theme")).toBeNull();
  });

  // A complete-enough stub: the provider subscribes to the media query, so a bare { matches }
  // makes subscribe throw and takes an unrelated test down with it.
  function stubDarkSystem() {
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: true,
      media: "",
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    } as unknown as MediaQueryList);
  }

  it("falls back to the system preference when nothing is stored", () => {
    stubDarkSystem();
    runBoot();

    expect(document.documentElement.dataset.adminTheme).toBe("dark");
  });

  it("still themes when localStorage throws, which is the case a single try used to skip", () => {
    stubDarkSystem();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });
    runBoot();

    // A restricted or private context has no storage. Wrapping the storage read and the
    // matchMedia fallback in one try meant this left the page unthemed until the provider mounted.
    expect(document.documentElement.dataset.adminTheme).toBe("dark");
  });
});

describe("fixture theme controls", () => {
  it("localizes the reusable preference selector", () => {
    render(
      <AdminI18nProvider locale="tr">
        <AdminThemeProvider><AdminThemePreference /></AdminThemeProvider>
      </AdminI18nProvider>,
    );

    expect(screen.getByRole("combobox", { name: "Renk modu" })).toHaveValue("system");
    expect(screen.getByRole("option", { name: "Açık" })).toBeInTheDocument();
  });

  it("requires the provider for the reusable selector", () => {
    expect(() => render(<AdminThemePreference />)).toThrow("AdminThemePreference requires AdminThemeProvider");
  });

  it("shows standard host surfaces and controls inside the theme demo", () => {
    renderControls();

    expect(screen.getByRole("region", { name: "Host content dark-mode preview" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Host name" })).toHaveClass("bg-white", "text-neutral-950");
    expect(screen.getByRole("combobox", { name: "Host status" })).toHaveClass("bg-white", "text-neutral-950");
    expect(screen.getByRole("table")).toHaveClass("border-neutral-200");
  });

  it("retains dark mode after remounting the theme editor", async () => {
    const user = userEvent.setup();
    const firstMount = renderControls();
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Color mode" })).toHaveValue("system"));
    await user.selectOptions(screen.getByRole("combobox", { name: "Color mode" }), "dark");
    await waitFor(() => expect(window.localStorage.getItem(ADMIN_THEME_PREFERENCE_STORAGE_KEY)).toBe("dark"));
    expect(document.documentElement.dataset.adminTheme).toBe("dark");

    firstMount.unmount();
    renderControls();

    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: "Color mode" })).toHaveValue("dark");
      expect(document.documentElement.dataset.adminTheme).toBe("dark");
    });
  });

  it("defaults to system and follows the operating system before any explicit choice", async () => {
    let matches = true;
    const media = {
      get matches() {
        return matches;
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList;
    vi.spyOn(window, "matchMedia").mockReturnValue(media);

    renderControls();

    // No stored preference, so the selector sits on System rather than Light.
    expect(await screen.findByRole("combobox", { name: "Color mode" })).toHaveValue("system");
    await waitFor(() => expect(document.documentElement.dataset.adminTheme).toBe("dark"));
    // Nothing is written until the visitor chooses, so the default is not persisted.
    expect(window.localStorage.getItem(ADMIN_THEME_PREFERENCE_STORAGE_KEY)).toBeNull();

    matches = false;
    act(() => {
      (window.matchMedia("(prefers-color-scheme: dark)") as unknown as {
        addEventListener: { mock: { calls: Array<[string, () => void]> } };
      }).addEventListener.mock.calls[0]?.[1]?.();
    });
    await waitFor(() => expect(document.documentElement.dataset.adminTheme).toBe("light"));
  });

  it("reports the same default from the hook when used outside a provider", () => {
    function Probe() {
      const { theme, resolvedTheme } = useAdminTheme();
      return <span>{`${theme}:${resolvedTheme}`}</span>;
    }
    render(<Probe />);

    // `theme` must match the provider's default, or a consumer rendering the hook before
    // the provider mounts would flash a different selection. `resolvedTheme` deliberately
    // does not: the fallback has no way to read the operating system preference, so it
    // stays light even where the provider would resolve to dark. What holds is the
    // selection, not the resolved value.
    expect(screen.getByText("system:light")).toBeInTheDocument();
  });

  it("shows no stale theme on any render when the server snapshot matches the default", async () => {
    // useSyncExternalStore only consults getServerSnapshot under hydrateRoot, so a plain
    // render cannot observe this at all. Hydrating the server markup shows the real cost of
    // a mismatched snapshot: the client renders the stale server value before correcting,
    // so the selector briefly reads Light on a machine that should say System.
    const media = {
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList;
    vi.spyOn(window, "matchMedia").mockReturnValue(media);

    const renders: string[] = [];
    function Probe() {
      const { theme, resolvedTheme } = useAdminTheme();
      renders.push(`${theme}:${resolvedTheme}`);
      return null;
    }
    const tree = (
      <AdminThemeProvider>
        <Probe />
      </AdminThemeProvider>
    );

    const container = document.createElement("div");
    container.innerHTML = renderToString(tree);
    document.body.append(container);
    let root: ReturnType<typeof hydrateRoot> | undefined;
    try {
      await act(async () => {
        root = hydrateRoot(container, tree);
      });

      // Every render agrees. With an unaligned snapshot the first two read "light:light".
      expect(renders.length).toBeGreaterThan(0);
      expect(new Set(renders)).toEqual(new Set(["system:light"]));
    } finally {
      // A failed assertion above would otherwise leave a live root subscribed to the
      // module-level listener set, still writing to the document for the rest of the suite.
      const activeRoot = root;
      if (activeRoot) await act(async () => activeRoot.unmount());
      container.remove();
    }
  });

  it("keeps the pre-paint theme through hydration", async () => {
    window.localStorage.setItem(ADMIN_THEME_PREFERENCE_STORAGE_KEY, "dark");
    new Function(ADMIN_THEME_BOOT_SCRIPT)();
    const tree = <AdminThemeProvider><ThemeControls /></AdminThemeProvider>;
    const container = document.createElement("div");
    container.innerHTML = renderToString(tree);
    document.body.append(container);
    let root: ReturnType<typeof hydrateRoot> | undefined;
    const previousThemes: (string | null)[] = [];
    const observer = new MutationObserver((records) => {
      previousThemes.push(...records.map((record) => record.oldValue));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-admin-theme"], attributeOldValue: true });
    try {
      await act(async () => {
        root = hydrateRoot(container, tree);
      });

      previousThemes.push(...observer.takeRecords().map((record) => record.oldValue));
      expect(document.documentElement.dataset.adminTheme).toBe("dark");
      expect(previousThemes.every((theme) => theme === "dark")).toBe(true);
      expect(screen.getByRole("combobox", { name: "Color mode" })).toHaveValue("dark");
    } finally {
      observer.disconnect();
      const activeRoot = root;
      if (activeRoot) await act(async () => activeRoot.unmount());
      container.remove();
    }
  });

  it("keeps an explicit choice across a remount", async () => {
    const user = userEvent.setup();
    const first = renderControls();
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Color mode" })).toHaveValue("system"));
    await user.selectOptions(screen.getByRole("combobox", { name: "Color mode" }), "light");
    await waitFor(() => expect(window.localStorage.getItem(ADMIN_THEME_PREFERENCE_STORAGE_KEY)).toBe("light"));

    first.unmount();
    renderControls();

    // An explicit Light must win over the System default on the next mount.
    expect(await screen.findByRole("combobox", { name: "Color mode" })).toHaveValue("light");
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
    window.localStorage.setItem(ADMIN_THEME_PREFERENCE_STORAGE_KEY, "system");

    renderControls();

    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: "Color mode" })).toHaveValue("system");
      expect(document.documentElement.dataset.adminTheme).toBe("dark");
    });

    matches = false;
    act(() => onChange?.({ matches } as MediaQueryListEvent));

    await waitFor(() => expect(document.documentElement.dataset.adminTheme).toBe("light"));
  });

  it("applies preference changes from another tab", async () => {
    renderControls();
    window.localStorage.setItem(ADMIN_THEME_PREFERENCE_STORAGE_KEY, "dark");
    act(() => window.dispatchEvent(new StorageEvent("storage", {
      key: ADMIN_THEME_PREFERENCE_STORAGE_KEY,
      newValue: "dark",
    })));

    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: "Color mode" })).toHaveValue("dark");
      expect(document.documentElement.dataset.adminTheme).toBe("dark");
    });
  });

  it("keeps system preference in exported presets and the theme page provider", async () => {
    const user = userEvent.setup();
    render(<AdminThemeProvider><ThemePage /></AdminThemeProvider>);
    const mode = screen.getByRole("combobox", { name: "Color mode" });
    await waitFor(() => expect(mode).toHaveValue("system"));
    // The default is now System, so selecting it fires no change event. Move away
    // first so the switch back is a real transition and actually persists.
    await user.selectOptions(mode, "light");
    await waitFor(() => expect(window.localStorage.getItem(ADMIN_THEME_PREFERENCE_STORAGE_KEY)).toBe("light"));
    await user.selectOptions(mode, "system");
    await waitFor(() => expect(window.localStorage.getItem(ADMIN_THEME_PREFERENCE_STORAGE_KEY)).toBe("system"));
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValueOnce();
    await user.click(screen.getByRole("button", { name: "Export preset" }));
    const preset = writeText.mock.calls[0][0] as string;
    expect(JSON.parse(preset)).toMatchObject({ theme: "system" });
    fireEvent.change(screen.getByRole("textbox", { name: "Theme preset JSON" }), { target: { value: preset } });
    await user.click(screen.getByRole("button", { name: "Import preset" }));
    await waitFor(() => expect(window.localStorage.getItem(ADMIN_THEME_PREFERENCE_STORAGE_KEY)).toBe("system"));
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

  it("keeps an explicit selection usable when browser storage is unavailable", async () => {
    const user = userEvent.setup();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });
    renderControls();

    await user.selectOptions(screen.getByRole("combobox", { name: "Color mode" }), "dark");

    expect(screen.getByRole("combobox", { name: "Color mode" })).toHaveValue("dark");
    expect(document.documentElement.dataset.adminTheme).toBe("dark");
  });
});

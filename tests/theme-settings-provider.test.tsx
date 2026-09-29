// SPDX-License-Identifier: MIT
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { AdminThemeSettingsProvider, useAdminThemeSettings } from "@yesvus/helmdeck";
import { Button } from "../src/primitives/button.js";
import { ADMIN_DENSITY_SCALE } from "../src/theme/density.js";

/**
 * A host that can store a density and an accent has still not shipped a feature unless the
 * stored value reaches the document the components read from. These render the provider the
 * way a host would, around a real control, and read what landed on the document root.
 */
afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("style");
});

function rootStyle(name: string): string {
  return document.documentElement.style.getPropertyValue(name);
}

function SettingsScreen() {
  const { settings, problems, setSettings } = useAdminThemeSettings();
  return (
    <form>
      <Button
        onClick={() => setSettings({ density: "compact" })}
        aria-describedby="applied"
      >
        Compact
      </Button>
      <span id="applied" aria-label="Applied settings">
        {`${settings.density}:${settings.accent ?? "palette"}`}
      </span>
      <p role="status">{problems.map((problem) => `${problem.setting} ${problem.reason}`).join(" ")}</p>
    </form>
  );
}

describe("a host applies its theme settings through the provider", () => {
  it("writes the density onto the document root, where the spacing scale reads it", async () => {
    render(
      <AdminThemeSettingsProvider settings={{ density: "spacious" }}>
        <SettingsScreen />
      </AdminThemeSettingsProvider>,
    );

    await waitFor(() => expect(rootStyle("--admin-density")).toBe(ADMIN_DENSITY_SCALE.spacious));
    expect(rootStyle("--admin-density")).toBe("1.15");
    // No accent means the palette in tokens.css stands, so the contrast suite keeps
    // describing what a host with no branding renders.
    expect(rootStyle("--admin-brand-500")).toBe("");
    expect(document.documentElement.style.length).toBe(1);
  });

  it("changes the applied density when the host changes the setting", async () => {
    render(
      <AdminThemeSettingsProvider settings={{ density: "comfortable" }}>
        <SettingsScreen />
      </AdminThemeSettingsProvider>,
    );
    await waitFor(() => expect(rootStyle("--admin-density")).toBe("1"));

    fireEvent.click(screen.getByRole("button", { name: "Compact" }));

    expect(screen.getByLabelText("Applied settings")).toHaveTextContent("compact:palette");
    expect(rootStyle("--admin-density")).toBe("0.85");
  });

  it("reports a refused accent to the host instead of applying it", async () => {
    render(
      <AdminThemeSettingsProvider settings={{ accent: "#808080" }}>
        <SettingsScreen />
      </AdminThemeSettingsProvider>,
    );

    // The mid-tone is refused, the palette stands, and the host is told why. A control that
    // silently kept the previous colour would leave the operator hunting.
    expect(screen.getByLabelText("Applied settings")).toHaveTextContent("comfortable:palette");
    expect(rootStyle("--admin-brand-500")).toBe("");
    expect(screen.getByRole("status")).toHaveTextContent("accent");
    expect(screen.getByRole("status")).toHaveTextContent("4.5:1");
  });

  it("applies a brand the host can actually read, per mode", async () => {
    const { rerender } = render(
      <AdminThemeSettingsProvider settings={{ accent: "#1d9bf0" }} mode="light">
        <SettingsScreen />
      </AdminThemeSettingsProvider>,
    );
    await waitFor(() => expect(rootStyle("--admin-brand-500")).toBe("#1d9bf0"));
    const lightText = rootStyle("--admin-brand-text");
    const lightLabel = rootStyle("--admin-on-brand");

    rerender(
      <AdminThemeSettingsProvider settings={{ accent: "#1d9bf0" }} mode="dark">
        <SettingsScreen />
      </AdminThemeSettingsProvider>,
    );
    await waitFor(() => expect(rootStyle("--admin-brand-text")).not.toBe(lightText));
    // A mid-light accent takes the dark label, and the mode changes only the derived text.
    expect(lightLabel).toBe("#1c1917");
    expect(rootStyle("--admin-brand-500")).toBe("#1d9bf0");
  });

  it("removes what it wrote when it unmounts, so a second host is not overridden", async () => {
    const first = render(
      <AdminThemeSettingsProvider settings={{ density: "compact", accent: "#1d9bf0" }}>
        <SettingsScreen />
      </AdminThemeSettingsProvider>,
    );
    await waitFor(() => expect(rootStyle("--admin-density")).toBe("0.85"));

    first.unmount();

    expect(rootStyle("--admin-density")).toBe("");
    expect(rootStyle("--admin-brand-500")).toBe("");
  });

  it("scopes the settings to a subtree when the host passes a target", async () => {
    function Scoped() {
      const [element, setElement] = useState<HTMLDivElement | null>(null);
      return (
        <div ref={setElement} data-testid="scope">
          <AdminThemeSettingsProvider settings={{ density: "compact" }} target={element}>
            <SettingsScreen />
          </AdminThemeSettingsProvider>
        </div>
      );
    }
    render(<Scoped />);

    await waitFor(() =>
      expect(screen.getByTestId("scope").style.getPropertyValue("--admin-density")).toBe("0.85"),
    );
    // The document root is untouched, so the rest of the host's pages keep the default.
    expect(rootStyle("--admin-density")).toBe("");
  });

  it("reads the defaults outside a provider rather than throwing", () => {
    function Probe() {
      const { settings, problems } = useAdminThemeSettings();
      return <span>{`${settings.density}:${problems.length}`}</span>;
    }
    render(<Probe />);

    expect(screen.getByText("comfortable:0")).toBeInTheDocument();
  });
});

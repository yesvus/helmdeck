// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { createAdminPayloadTheme } from "../src/payload/theme";

describe("the payload theme", () => {
  it("gives payload the host's own logo, dashboard line and way back", () => {
    const theme = createAdminPayloadTheme({
      logo: "./payload-brand-logo",
      beforeDashboard: ["./payload-dashboard-brief"],
      afterNavLinks: ["./payload-back-link"],
    });

    expect(theme.components.graphics?.Logo).toBe("./payload-brand-logo");
    expect(theme.components.beforeDashboard).toEqual(["./payload-dashboard-brief"]);
    expect(theme.components.afterNavLinks).toEqual(["./payload-back-link"]);
  });

  it("leaves out what the host did not give it", () => {
    const theme = createAdminPayloadTheme();
    expect(theme.components).toEqual({});
  });

  it("leaves out the slots the host did not give it, when it gave it some", () => {
    const theme = createAdminPayloadTheme({ logo: "./payload-brand-logo" });
    expect(theme.components).toEqual({ graphics: { Logo: "./payload-brand-logo" } });
  });
});

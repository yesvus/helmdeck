import { describe, expect, it, vi } from "vitest";
const request = vi.hoisted(() => ({ session: undefined as string | undefined }));
const guard = vi.hoisted(() => {
  class RedirectSignal extends Error { constructor(public url: string) { super(url); } }
  return { RedirectSignal };
});
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (n === "helmdeck_session" && request.session !== undefined ? { name: n, value: request.session } : undefined),
    set: (n: string, v: string) => { request.session = v; },
    delete: () => { request.session = undefined; },
  }),
}));
vi.mock("next/navigation", () => ({ redirect: (u: string) => { throw new guard.RedirectSignal(u); } }));
vi.mock("next/navigation.js", () => ({
  redirect: (u: string) => { throw new guard.RedirectSignal(u); },
  usePathname: () => "/shell",
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/link.js", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock("../fixtures/app/shell/sign-out-action", () => ({ signOutAction: vi.fn() }));
vi.mock("../fixtures/lib/demo-permissions", () => ({ demoPermissionsAdapter: () => ({ can: () => true }) }));

describe("probe", () => {
  it("signs in then reads the settings", async () => {
    vi.stubGlobal("window", undefined);
    const { DEMO_PASSWORD, demoAccounts } = await import("../fixtures/lib/demo-accounts");
    const { ensureDemoSeeded } = await import("../fixtures/lib/ensure-seeded");
    const { signInAction } = await import("../fixtures/app/login/actions");
    await ensureDemoSeeded();
    const r = await signInAction({ email: demoAccounts[0].email, password: DEMO_PASSWORD }, "");
    expect(r.ok).toBe(true);
    expect(request.session).toBeTypeOf("string");
    const { readSiteSettingsAction } = await import("../fixtures/lib/demo-settings");
    const settings = await readSiteSettingsAction();
    expect(settings.density).toBeTypeOf("string");
    vi.unstubAllGlobals();
  }, 30000);
});

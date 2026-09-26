// SPDX-License-Identifier: MIT
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminI18nProvider } from "../src/i18n";
import { AdminAuthProvider, AdminRequireSession, useAdminSession } from "../src/shell/auth";
import type { AdminAuthAdapter, AdminSession } from "../src/adapters/index";

const navigation = vi.hoisted(() => ({
  pathname: "/admin/products",
  params: new URLSearchParams() as URLSearchParams | null,
  push: vi.fn(),
}));

vi.mock("next/navigation.js", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: navigation.push }),
  useSearchParams: () => navigation.params,
}));

const session: AdminSession = { email: "ada@example.com", name: "Ada", role: "editor" };

// defaultAdminLocale is "tr", so these are the strings a host sees with nothing configured.
const TR = {
  checking: "Oturumunuz denetleniyor.",
  redirecting: "Bu sayfayı görüntülemek için giriş yapmanız gerekiyor.",
  signInLink: "Giriş sayfasına gidin",
};

function adapter(overrides: Partial<AdminAuthAdapter> = {}): AdminAuthAdapter {
  return {
    getSession: vi.fn().mockResolvedValue(session),
    login: vi.fn().mockResolvedValue({ ok: true, session }),
    logout: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/** The protected subtree a host would wrap, with something focusable in it. */
function secret() {
  return (
    <div>
      <button type="button">Invoices</button>
      <p>billing</p>
    </div>
  );
}

function StatusProbe() {
  const { status, session: current } = useAdminSession();
  return <span data-testid="status">{`${status}:${current?.email ?? "none"}`}</span>;
}

/** Drives the provider through its public API the way a host sign-in form would. */
function SessionActions() {
  const { login, logout } = useAdminSession();
  return (
    <>
      <button type="button" onClick={() => void login({ email: "ada@example.com", password: "hunter2" })}>
        do sign in
      </button>
      <button type="button" onClick={() => void logout()}>
        do sign out
      </button>
    </>
  );
}

function renderGuarded(auth: AdminAuthAdapter, props: Partial<React.ComponentProps<typeof AdminRequireSession>> = {}) {
  return render(
    <AdminAuthProvider adapter={auth}>
      <AdminRequireSession {...props}>{secret()}</AdminRequireSession>
    </AdminAuthProvider>,
  );
}

afterEach(() => {
  navigation.pathname = "/admin/products";
  navigation.params = new URLSearchParams();
  navigation.push.mockClear();
});

describe("AdminAuthProvider", () => {
  it("resolves the session once and shares it with every consumer", async () => {
    const auth = adapter();
    render(
      <AdminAuthProvider adapter={auth}>
        <StatusProbe />
        <StatusProbe />
      </AdminAuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getAllByTestId("status")[0]).toHaveTextContent("authenticated:ada@example.com");
    });
    expect(screen.getAllByTestId("status")[1]).toHaveTextContent("authenticated:ada@example.com");
    expect(auth.getSession).toHaveBeenCalledTimes(1);
  });

  it("reports an absent session as anonymous rather than leaving it checking forever", async () => {
    render(
      <AdminAuthProvider adapter={adapter({ getSession: vi.fn().mockResolvedValue(null) })}>
        <StatusProbe />
      </AdminAuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("anonymous:none"));
  });

  it("applies a successful sign-in without waiting for another read", async () => {
    const auth = adapter({ getSession: vi.fn().mockResolvedValue(null) });
    render(
      <AdminAuthProvider adapter={auth}>
        <StatusProbe />
        <SessionActions />
      </AdminAuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("anonymous"));

    await act(async () => {
      screen.getByRole("button", { name: "do sign in" }).click();
    });

    expect(screen.getByTestId("status")).toHaveTextContent("authenticated:ada@example.com");
    // The provider trusted login() rather than re-reading, so getSession ran only once.
    expect(auth.getSession).toHaveBeenCalledTimes(1);
  });

  it("clears the session on a failed sign-in so a stale one cannot survive", async () => {
    const auth = adapter({ login: vi.fn().mockResolvedValue({ ok: false, message: "Bad password" }) });
    render(
      <AdminAuthProvider adapter={auth}>
        <StatusProbe />
        <SessionActions />
      </AdminAuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));

    await act(async () => {
      screen.getByRole("button", { name: "do sign in" }).click();
    });

    expect(screen.getByTestId("status")).toHaveTextContent("anonymous:none");
  });

  it("clears the session on sign-out", async () => {
    const auth = adapter();
    render(
      <AdminAuthProvider adapter={auth}>
        <StatusProbe />
        <SessionActions />
      </AdminAuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));

    await act(async () => {
      screen.getByRole("button", { name: "do sign out" }).click();
    });

    expect(screen.getByTestId("status")).toHaveTextContent("anonymous:none");
    expect(auth.logout).toHaveBeenCalledTimes(1);
  });

  it("re-enters checking when the adapter is swapped, so a stale session is never shown", async () => {
    const first = adapter();
    const second = adapter({ getSession: vi.fn().mockResolvedValue(null) });
    const { rerender } = render(
      <AdminAuthProvider adapter={first}>
        <StatusProbe />
      </AdminAuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));

    rerender(
      <AdminAuthProvider adapter={second}>
        <StatusProbe />
      </AdminAuthProvider>,
    );

    // Synchronously after the swap, before the new read settles: not the old session.
    expect(screen.getByTestId("status")).toHaveTextContent("checking:none");
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("anonymous:none"));
  });

  it("refuses to guess when used outside the provider", () => {
    // Silently returning null here would let a host ship a guard that never guards.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<StatusProbe />)).toThrow(/AdminAuthProvider/);
    spy.mockRestore();
  });
});

describe("AdminRequireSession", () => {
  it("renders the protected tree only once the session is known to be good", async () => {
    renderGuarded(adapter());

    expect(screen.queryByText("Invoices")).not.toBeInTheDocument();
    expect(await screen.findByText("Invoices")).toBeInTheDocument();
  });

  it("withholds focusable content while the session is still unknown", async () => {
    // Rendering the children and hiding them would leave a real button in the tab order and
    // readable text in the accessibility tree for a page the visitor may not have access to.
    let release: (value: AdminSession | null) => void = () => {};
    const auth = adapter({
      getSession: () => new Promise<AdminSession | null>((resolve) => { release = resolve; }),
    });
    renderGuarded(auth);

    expect(screen.getByRole("status")).toHaveTextContent(TR.checking);
    expect(screen.queryByText("Invoices")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();

    await act(async () => {
      release(session);
    });
    expect(await screen.findByText("Invoices")).toBeInTheDocument();
  });

  it("announces the redirect and keeps a real link forward when anonymous", async () => {
    renderGuarded(adapter({ getSession: vi.fn().mockResolvedValue(null) }));

    expect(await screen.findByRole("status")).toHaveTextContent(TR.redirecting);
    // The redirect must not be the only way forward, or a keyboard or screen-reader user who
    // lands here cannot proceed at all.
    const link = screen.getByRole("link", { name: TR.signInLink });
    expect(link).toHaveAttribute("href", "/admin/login?next=%2Fadmin%2Fproducts");
    expect(screen.queryByText("Invoices")).not.toBeInTheDocument();
  });

  it("sends the visitor to the intended page including its query string", async () => {
    navigation.pathname = "/admin/products";
    navigation.params = new URLSearchParams("page=2&sort=name");
    renderGuarded(adapter({ getSession: vi.fn().mockResolvedValue(null) }));

    await waitFor(() => expect(navigation.push).toHaveBeenCalledTimes(1));
    const target = navigation.push.mock.calls[0][0] as string;
    expect(new URLSearchParams(target.split("?")[1]).get("next")).toBe("/admin/products?page=2&sort=name");
  });

  it("lets a host override the destination and the navigation", async () => {
    const onRedirect = vi.fn();
    renderGuarded(adapter({ getSession: vi.fn().mockResolvedValue(null) }), {
      loginHref: "/giris",
      returnTo: "/admin/billing",
      onRedirect,
    });

    await waitFor(() => expect(onRedirect).toHaveBeenCalledWith("/giris?next=%2Fadmin%2Fbilling"));
    // Overriding navigation means the router must be left alone.
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it("does not redirect while the session is still being read", async () => {
    let release: (value: AdminSession | null) => void = () => {};
    const auth = adapter({
      getSession: () => new Promise<AdminSession | null>((resolve) => { release = resolve; }),
    });
    renderGuarded(auth);

    expect(navigation.push).not.toHaveBeenCalled();

    await act(async () => {
      release(session);
    });
    expect(navigation.push).not.toHaveBeenCalled();
    expect(await screen.findByText("Invoices")).toBeInTheDocument();
  });

  it("takes its strings from the dictionary, so a host can localise the guard", async () => {
    // A hardcoded string would render identically here, which is the whole failure this
    // covers: the guard is the one surface a host cannot afford to be unable to translate.
    render(
      <AdminI18nProvider locale="en">
        <AdminAuthProvider adapter={adapter({ getSession: vi.fn().mockResolvedValue(null) })}>
          <AdminRequireSession>{secret()}</AdminRequireSession>
        </AdminAuthProvider>
      </AdminI18nProvider>,
    );

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("You need to sign in to view this page.");
    expect(status).not.toHaveTextContent(TR.redirecting);
    expect(screen.getByRole("link", { name: "Go to sign in" })).toBeInTheDocument();
  });

  it("survives a host that has no pathname to offer yet", async () => {
    navigation.pathname = "";
    renderGuarded(adapter({ getSession: vi.fn().mockResolvedValue(null) }));

    const link = await screen.findByRole("link", { name: TR.signInLink });
    expect(link).toHaveAttribute("href", "/admin/login?next=%2F");
  });
});

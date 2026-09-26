// SPDX-License-Identifier: MIT
import { act, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
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
  const { login, logout, refresh } = useAdminSession();
  const [refreshError, setRefreshError] = useState("");
  return (
    <>
      <button
        type="button"
        onClick={() => {
          // Only a rejection reaches this, so a message here is the proof that refresh threw.
          void refresh().catch((cause: unknown) => {
            setRefreshError(cause instanceof Error ? cause.message : String(cause));
          });
        }}
      >
        do refresh
      </button>
      <span data-testid="refresh-error">{refreshError}</span>
      <button
        type="button"
        onClick={() => {
          void login({ email: "ada@example.com", password: "hunter2" }).catch((cause: unknown) => {
            setRefreshError(cause instanceof Error ? cause.message : String(cause));
          });
        }}
      >
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

  it("does not let a read that started before sign-in undo the sign-in", async () => {
    // The read is still in flight when the visitor authenticates. Its late answer describes
    // the world before the sign-in, so applying it would sign the visitor straight back out.
    let release: (value: AdminSession | null) => void = () => {};
    const auth = adapter({
      getSession: () => new Promise<AdminSession | null>((resolve) => { release = resolve; }),
    });
    render(
      <AdminAuthProvider adapter={auth}>
        <StatusProbe />
        <SessionActions />
      </AdminAuthProvider>,
    );

    await act(async () => {
      screen.getByRole("button", { name: "do sign in" }).click();
    });
    expect(screen.getByTestId("status")).toHaveTextContent("authenticated:ada@example.com");

    await act(async () => {
      release(null);
    });

    expect(screen.getByTestId("status")).toHaveTextContent("authenticated:ada@example.com");
  });

  it("does not let a read that started before sign-out re-authenticate the visitor", async () => {
    // The read in flight here comes from a refresh, not from mount, so nothing but sign-out
    // itself can retire it. With a sign-in in the history the read would already be stale
    // before logout ran, and this would pass whether or not logout claimed the decision.
    const stale = { email: "ada@example.com" };
    let release: (value: AdminSession | null) => void = () => {};
    let reads = 0;
    const auth = adapter({
      getSession: vi.fn().mockImplementation(() => {
        reads += 1;
        return reads === 1
          ? Promise.resolve(session)
          : new Promise<AdminSession | null>((resolve) => { release = resolve; });
      }),
    });
    render(
      <AdminAuthProvider adapter={auth}>
        <StatusProbe />
        <SessionActions />
      </AdminAuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));

    // Start a refresh and leave it in flight, then sign out underneath it.
    await act(async () => {
      screen.getByRole("button", { name: "do refresh" }).click();
    });
    await act(async () => {
      screen.getByRole("button", { name: "do sign out" }).click();
    });
    expect(screen.getByTestId("status")).toHaveTextContent("anonymous");

    await act(async () => {
      release(stale);
    });

    expect(screen.getByTestId("status")).toHaveTextContent("anonymous:none");
  });

  it("does not strand the status when a sign-in is attempted while the read is pending", async () => {
    // cubic's case: the sign-in retires the in-flight read, then itself fails, and with
    // nothing left able to report a session the guard sat on "checking" indefinitely.
    let release: (value: AdminSession | null) => void = () => {};
    const auth = adapter({
      getSession: () => new Promise<AdminSession | null>((resolve) => { release = resolve; }),
      login: vi.fn().mockRejectedValue(new Error("identity provider unreachable")),
    });
    render(
      <AdminAuthProvider adapter={auth}>
        <StatusProbe />
        <SessionActions />
      </AdminAuthProvider>,
    );

    await act(async () => {
      screen.getByRole("button", { name: "do sign in" }).click();
    });
    // The read is still live, so the failed sign-in must not have retired it.
    await act(async () => {
      release(null);
    });

    expect(screen.getByTestId("status")).toHaveTextContent("anonymous:none");
  });

  it("lets the live read report a failure when a sign-in was attempted and failed", async () => {
    let reject: (cause: unknown) => void = () => {};
    const auth = adapter({
      getSession: () => new Promise<AdminSession | null>((_resolve, cause) => { reject = cause; }),
      login: vi.fn().mockRejectedValue(new Error("identity provider unreachable")),
    });
    render(
      <AdminAuthProvider adapter={auth}>
        <StatusProbe />
        <SessionActions />
      </AdminAuthProvider>,
    );

    await act(async () => {
      screen.getByRole("button", { name: "do sign in" }).click();
    });
    await act(async () => {
      reject(new Error("session endpoint down"));
    });

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("error:none"));
  });

  it("re-reads and applies a changed session on refresh", async () => {
    // Without this, a refresh that stopped re-reading, or read but did not apply, would pass
    // every other provider test in this file.
    const getSession = vi.fn().mockResolvedValueOnce(session).mockResolvedValueOnce(null);
    const auth = adapter({ getSession });
    render(
      <AdminAuthProvider adapter={auth}>
        <StatusProbe />
        <SessionActions />
      </AdminAuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));

    await act(async () => {
      screen.getByRole("button", { name: "do refresh" }).click();
    });

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("anonymous:none"));
    expect(getSession).toHaveBeenCalledTimes(2);
  });

  it("settles into an error state when the read rejects, rather than checking forever", async () => {
    // The read settling as rejected is the common case for a session endpoint that is down.
    // Left unhandled it never settled, and the guard sat on "checking" for the lifetime of
    // the page with no way forward.
    const boom = new Error("session endpoint unreachable");
    const auth = adapter({ getSession: vi.fn().mockRejectedValue(boom) });
    render(
      <AdminAuthProvider adapter={auth}>
        <StatusProbe />
      </AdminAuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("error:none"));
  });

  it("exposes the failure so a host can log or surface it", async () => {
    const boom = new Error("session endpoint unreachable");
    const auth = adapter({ getSession: vi.fn().mockRejectedValue(boom) });
    function ErrorProbe() {
      const { error } = useAdminSession();
      return <span data-testid="error">{error instanceof Error ? error.message : "none"}</span>;
    }
    render(
      <AdminAuthProvider adapter={auth}>
        <ErrorProbe />
      </AdminAuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("error")).toHaveTextContent("session endpoint unreachable"));
  });

  it("records a failed refresh in the context and still rejects to the caller", async () => {
    // The context must never describe a read that did not happen, and a host that awaited
    // refresh() to drive its own spinner still needs to see the rejection.
    const boom = new Error("refresh failed");
    const auth = adapter({ getSession: vi.fn().mockRejectedValue(boom) });
    function ErrorProbe() {
      const { error } = useAdminSession();
      return <span data-testid="error">{error instanceof Error ? error.message : "none"}</span>;
    }
    render(
      <AdminAuthProvider adapter={auth}>
        <StatusProbe />
        <ErrorProbe />
        <SessionActions />
      </AdminAuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("error"));

    await act(async () => {
      screen.getByRole("button", { name: "do refresh" }).click();
    });

    // Reaching the catch at all is the proof that refresh rejected to its caller.
    await waitFor(() => expect(screen.getByTestId("refresh-error")).toHaveTextContent("refresh failed"));
    expect(screen.getByTestId("error")).toHaveTextContent("refresh failed");
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

  it("announces a failed read and does not bounce the visitor to sign in", async () => {
    // Redirecting here would send a signed-in visitor to the login page every time their
    // session endpoint blips, and loop there when the login page needs the same read.
    const onRedirect = vi.fn();
    renderGuarded(adapter({ getSession: vi.fn().mockRejectedValue(new Error("down")) }), { onRedirect });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Oturumunuz denetlenemedi");
    expect(onRedirect).not.toHaveBeenCalled();
    expect(navigation.push).not.toHaveBeenCalled();
    expect(screen.queryByText("Invoices")).not.toBeInTheDocument();
  });

  it("keeps a query string the host already put on the login URL", async () => {
    // A second "?" would make the URL malformed, and a tenant or return flag on the login URL
    // is an ordinary host setup rather than an exotic one.
    const onRedirect = vi.fn();
    renderGuarded(adapter({ getSession: vi.fn().mockResolvedValue(null) }), {
      loginHref: "/admin/login?tenant=acme",
      onRedirect,
    });

    await waitFor(() => expect(onRedirect).toHaveBeenCalled());
    const target = onRedirect.mock.calls[0][0] as string;
    expect(target.startsWith("/admin/login?")).toBe(true);
    expect(target.match(/\?/g)).toHaveLength(1);
    const params = new URLSearchParams(target.split("?")[1]);
    expect(params.get("tenant")).toBe("acme");
    expect(params.get("next")).toBe("/admin/products");
  });

  it("replaces a stale next on the login URL rather than sending both", async () => {
    const onRedirect = vi.fn();
    renderGuarded(adapter({ getSession: vi.fn().mockResolvedValue(null) }), {
      loginHref: "/admin/login?next=/stale",
      returnTo: "/admin/fresh",
      onRedirect,
    });

    await waitFor(() => expect(onRedirect).toHaveBeenCalled());
    const params = new URLSearchParams((onRedirect.mock.calls[0][0] as string).split("?")[1]);
    expect(params.getAll("next")).toEqual(["/admin/fresh"]);
  });

  it("keeps a fragment on the login URL out of the query", async () => {
    // Left in place, a login URL ending in "#section" swallows the appended query into the
    // fragment, and the preserved destination is then unreadable on the login page.
    const onRedirect = vi.fn();
    renderGuarded(adapter({ getSession: vi.fn().mockResolvedValue(null) }), {
      loginHref: "/admin/login#sign-in",
      onRedirect,
    });

    await waitFor(() => expect(onRedirect).toHaveBeenCalled());
    const target = onRedirect.mock.calls[0][0] as string;
    expect(target.endsWith("#sign-in")).toBe(true);
    const params = new URLSearchParams(target.slice(target.indexOf("?") + 1, target.indexOf("#")));
    expect(params.get("next")).toBe("/admin/products");
  });

  it("handles a login URL carrying both a query and a fragment", async () => {
    const onRedirect = vi.fn();
    renderGuarded(adapter({ getSession: vi.fn().mockResolvedValue(null) }), {
      loginHref: "/admin/login?tenant=acme#sign-in",
      onRedirect,
    });

    await waitFor(() => expect(onRedirect).toHaveBeenCalled());
    const target = onRedirect.mock.calls[0][0] as string;
    const params = new URLSearchParams(target.slice(target.indexOf("?") + 1, target.indexOf("#")));
    expect(params.get("tenant")).toBe("acme");
    expect(params.get("next")).toBe("/admin/products");
    expect(target.endsWith("#sign-in")).toBe(true);
  });

  it("refuses a returnTo the host read from its own query string", async () => {
    // returnTo is host-supplied, so a host that forwards a value from its own URL would
    // otherwise walk straight past the validation the login-page reader applies.
    const onRedirect = vi.fn();
    renderGuarded(adapter({ getSession: vi.fn().mockResolvedValue(null) }), {
      returnTo: "https://evil.example/steal",
      onRedirect,
    });

    await waitFor(() => expect(onRedirect).toHaveBeenCalled());
    const params = new URLSearchParams((onRedirect.mock.calls[0][0] as string).split("?")[1]);
    expect(params.get("next")).toBe("/");
  });

  it("survives a host that has no pathname to offer yet", async () => {
    navigation.pathname = "";
    renderGuarded(adapter({ getSession: vi.fn().mockResolvedValue(null) }));

    const link = await screen.findByRole("link", { name: TR.signInLink });
    expect(link).toHaveAttribute("href", "/admin/login?next=%2F");
  });
});

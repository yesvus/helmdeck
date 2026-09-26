// SPDX-License-Identifier: MIT
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  AdminI18nProvider,
  AdminShell,
  useAdminContentLocale,
  useAdminHref,
  useAdminMessages,
  type AdminLocaleAdapter,
  type AdminNavGroup,
} from "../src";

vi.mock("next/navigation.js", () => ({ usePathname: () => "/admin" }));

const nav: AdminNavGroup[] = [
  {
    label: "İçerik",
    items: [
      { href: "/admin", label: "Genel bakış" },
      { href: "/admin/urunler", label: "Ürünler" },
    ],
  },
];

function withContentLocale(href: string, contentLocale: string) {
  const [path, query = ""] = href.split("?", 2);
  const params = new URLSearchParams(query);
  params.set("locale", contentLocale);
  return `${path}?${params.toString()}`;
}

function LocaleAdapter({ adapter, children }: { adapter: AdminLocaleAdapter; children: React.ReactNode }) {
  return (
    <AdminI18nProvider localeAdapter={adapter}>
      {children}
    </AdminI18nProvider>
  );
}

function adapter(overrides: Partial<AdminLocaleAdapter> = {}): AdminLocaleAdapter {
  return {
    getInterfaceLocale: () => "tr",
    getContentLocale: () => "en",
    toHref: withContentLocale,
    ...overrides,
  };
}

function MessageProbe() {
  const messages = useAdminMessages();
  return <p>{messages.shell.searchLabel}</p>;
}

function HrefProbe({ href }: { href: string }) {
  const toHref = useAdminHref();
  return <a href={toHref(href)}>probe</a>;
}

describe("host locale adapter", () => {
  it("serves Turkish interface messages with an English content locale", async () => {
    render(
      <LocaleAdapter adapter={adapter()}>
        <MessageProbe />
      </LocaleAdapter>,
    );

    expect(await screen.findByText("Yönetim sayfalarında arayın")).toBeInTheDocument();
  });

  it("keeps content locale on shell hrefs and leaves them alone without a host mapping", async () => {
    const { unmount } = render(
      <LocaleAdapter adapter={adapter()}>
        <HrefProbe href="/admin/urunler" />
      </LocaleAdapter>,
    );

    expect(await screen.findByRole("link", { name: "probe" })).toHaveAttribute(
      "href",
      "/admin/urunler?locale=en",
    );
    unmount();

    render(
      <LocaleAdapter adapter={adapter({ toHref: undefined })}>
        <HrefProbe href="/admin/urunler" />
      </LocaleAdapter>,
    );

    expect(screen.getByRole("link", { name: "probe" })).toHaveAttribute("href", "/admin/urunler");
  });

  it("preserves content locale across desktop and mobile navigation", async () => {
    render(
      <LocaleAdapter adapter={adapter()}>
        <AdminShell nav={nav} homeHref="/admin" showTopbar={false}>
          <p>içerik</p>
        </AdminShell>
      </LocaleAdapter>,
    );

    const products = await screen.findAllByRole("link", { name: "Ürünler" });
    expect(products.length).toBeGreaterThan(0);
    for (const link of products) {
      expect(link).toHaveAttribute("href", "/admin/urunler?locale=en");
    }
  });

  it("changes content locale without changing interface messages", async () => {
    const setContentLocale = vi.fn();

    function Switcher() {
      const { contentLocale, setContentLocale: select } = useAdminContentLocale();
      return (
        <>
          <MessageProbe />
          <button type="button" onClick={() => select("tr")}>
            switch
          </button>
          <span data-testid="content">{contentLocale}</span>
        </>
      );
    }

    render(
      <LocaleAdapter adapter={adapter({ setContentLocale })}>
        <Switcher />
      </LocaleAdapter>,
    );

    expect(await screen.findByText("Yönetim sayfalarında arayın")).toBeInTheDocument();
    await screen.findByText("en");

    await userEvent.click(screen.getByRole("button", { name: "switch" }));

    expect(setContentLocale).toHaveBeenCalledWith("tr");
    expect(screen.getByTestId("content")).toHaveTextContent("tr");
    expect(screen.getByText("Yönetim sayfalarında arayın")).toBeInTheDocument();
  });

  it("resolves asynchronous interface and content locales", async () => {
    render(
      <LocaleAdapter
        adapter={adapter({
          getInterfaceLocale: () => Promise.resolve("en"),
          getContentLocale: () => Promise.resolve("en"),
        })}
      >
        <HrefProbe href="/admin/urunler" />
      </LocaleAdapter>,
    );

    expect(await screen.findByRole("link", { name: "probe" })).toHaveAttribute(
      "href",
      "/admin/urunler?locale=en",
    );
  });

  it("stamps the content locale on the active route used for highlighting", async () => {
    render(
      <LocaleAdapter adapter={adapter()}>
        <AdminShell nav={nav} homeHref="/admin" showTopbar={false}>
          <p>içerik</p>
        </AdminShell>
      </LocaleAdapter>,
    );

    expect(await screen.findByRole("link", { name: "Genel bakış" })).toHaveAttribute(
      "href",
      "/admin?locale=en",
    );
  });

  it("drops the resolved content locale when the adapter stops mapping hrefs", async () => {
    function HrefProbe() {
      const toHref = useAdminHref();
      return <a href={toHref("/admin/urunler")}>probe</a>;
    }

    const { rerender } = render(
      <LocaleAdapter adapter={adapter()}>
        <HrefProbe />
      </LocaleAdapter>,
    );

    expect(await screen.findByRole("link", { name: "probe" })).toHaveAttribute(
      "href",
      "/admin/urunler?locale=en",
    );

    rerender(
      <LocaleAdapter adapter={adapter({ toHref: undefined })}>
        <HrefProbe />
      </LocaleAdapter>,
    );

    expect(await screen.findByRole("link", { name: "probe" })).toHaveAttribute(
      "href",
      "/admin/urunler",
    );
  });
});

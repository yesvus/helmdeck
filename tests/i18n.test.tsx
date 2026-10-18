// SPDX-License-Identifier: MIT
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AdminI18nProvider,
  AdminLanguagePreference,
  AdminModal,
  AdminModalContent,
  AdminModalTitle,
  AdminPagination,
  defaultAdminLocale,
  defineAdminMessages,
  getAdminMessageLocales,
  englishAdminMessages,
  getAdminMessages,
  turkishAdminMessages,
  useAdminMessages,
  useAdminInterfaceLocale,
  type AdminMessages,
} from "../src";

function MessageProbe() {
  const messages = useAdminMessages();
  return <p>{messages.shell.searchLabel}</p>;
}

describe("Helmdeck localization", () => {
  beforeEach(() => window.sessionStorage.removeItem("helmdeck-interface-locale"));

  it("ships English and Turkish dictionaries", () => {
    expect(englishAdminMessages.locale).toBe("en");
    expect(turkishAdminMessages.locale).toBe("tr");
    expect(turkishAdminMessages.shell.searchLabel).toBe("Yönetim sayfalarında arayın");
    expect(turkishAdminMessages.media.browse).toBe("Dosya seçiniz");
    expect(englishAdminMessages.media.total).toBe("total");
    expect(turkishAdminMessages.media.total).toBe("toplam");
  });

  it("gives every key in both dictionaries, so a new string cannot ship in one language only", () => {
    // English is the last-resort fallback, so a key present only in English renders in English for
    // every user without a single type error. Walking both sides of the object is the only
    // way to notice, and it has to be every key rather than the handful a test happens to read.
    const leafPaths = (messages: AdminMessages): string[] => {
      const found: string[] = [];
      const walk = (value: unknown, path: string) => {
        if (typeof value === "function" || value === null || typeof value !== "object") {
          found.push(path);
          return;
        }
        for (const [key, child] of Object.entries(value)) walk(child, `${path}.${key}`);
      };
      for (const [key, value] of Object.entries(messages)) walk(value, key);
      return [...new Set(found)].sort();
    };

    const english = leafPaths(englishAdminMessages);
    const turkish = leafPaths(turkishAdminMessages);

    expect(english.length).toBeGreaterThan(0);
    expect(turkish).toEqual(english);
  });

  it("defaults to English and resolves regional fallbacks", () => {
    expect(defaultAdminLocale).toBe("en");
    expect(getAdminMessages("fr")).toBe(englishAdminMessages);
    expect(getAdminMessages("fr", "tr-TR")).toBe(turkishAdminMessages);
    expect(getAdminMessages("EN-US")).toBe(englishAdminMessages);
    expect(getAdminMessages("TR-tr")).toBe(turkishAdminMessages);

    render(
      <AdminI18nProvider>
        <MessageProbe />
      </AdminI18nProvider>,
    );

    expect(screen.getByText("Search admin pages")).toBeInTheDocument();
  });

  it("lists registered dictionaries and persists the selected interface language for the tab", async () => {
    const { unmount } = render(
      <AdminI18nProvider>
        <AdminLanguagePreference />
        <MessageProbe />
      </AdminI18nProvider>,
    );
    expect(getAdminMessageLocales()).toContain("tr");
    fireEvent.change(screen.getByRole("combobox", { name: "Interface language" }), { target: { value: "tr" } });
    expect(await screen.findByText("Yönetim sayfalarında arayın")).toBeInTheDocument();
    unmount();
    render(
      <AdminI18nProvider>
        <MessageProbe />
      </AdminI18nProvider>,
    );
    expect(await screen.findByText("Yönetim sayfalarında arayın")).toBeInTheDocument();
  });

  it("uses a host locale preference adapter when supplied", async () => {
    const preference = {
      getLocale: () => "tr",
      setLocale: vi.fn(),
    };
    function LanguageProbe() {
      const { setInterfaceLocale } = useAdminInterfaceLocale();
      return <button onClick={() => setInterfaceLocale("en")}>English</button>;
    }
    render(
      <AdminI18nProvider localePreferenceAdapter={preference}>
        <MessageProbe />
        <LanguageProbe />
      </AdminI18nProvider>,
    );
    expect(await screen.findByText("Yönetim sayfalarında arayın")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "English" }));
    await waitFor(() => expect(preference.setLocale).toHaveBeenCalledWith("en"));
    expect(await screen.findByText("Search admin pages")).toBeInTheDocument();
  });

  it("updates interface messages when the locale prop changes", () => {
    const { rerender } = render(
      <AdminI18nProvider locale="tr">
        <MessageProbe />
      </AdminI18nProvider>,
    );

    expect(screen.getByText("Yönetim sayfalarında arayın")).toBeInTheDocument();

    rerender(
      <AdminI18nProvider locale="en">
        <MessageProbe />
      </AdminI18nProvider>,
    );

    expect(screen.getByText("Search admin pages")).toBeInTheDocument();
  });

  it("registers and provides custom dictionaries", () => {
    const custom: AdminMessages = {
      ...englishAdminMessages,
      locale: "de",
      searchLocale: "de-DE",
      shell: {
        ...englishAdminMessages.shell,
        searchLabel: "Administrationsseiten durchsuchen",
      },
    };
    defineAdminMessages(custom);

    render(
      <AdminI18nProvider locale="de">
        <MessageProbe />
      </AdminI18nProvider>,
    );

    expect(getAdminMessages("de")).toBe(custom);
    expect(getAdminMessageLocales()).toContain("de");
    expect(screen.getByText("Administrationsseiten durchsuchen")).toBeInTheDocument();
  });

  it("offers registered dictionaries in the settings language picker", async () => {
    const { container } = render(
      <AdminI18nProvider locale="en">
        <AdminLanguagePreference />
        <MessageProbe />
      </AdminI18nProvider>,
    );
    const language = screen.getByRole("combobox", { name: "Interface language" });
    expect(language.querySelectorAll("option")).toHaveLength(getAdminMessageLocales().length);
    fireEvent.change(language, { target: { value: "tr" } });
    expect(await screen.findByText("Yönetim sayfalarında arayın")).toBeInTheDocument();
    expect(window.sessionStorage.getItem("helmdeck-interface-locale")).toBe("tr");
    expect(container).toBeInTheDocument();
  });

  it("applies the active dictionary to reusable primitives", async () => {
    render(
      <AdminI18nProvider locale="tr">
        <AdminModal open>
          <AdminModalContent>
            <AdminModalTitle>İçerik</AdminModalTitle>
          </AdminModalContent>
        </AdminModal>
        <AdminPagination page={2} pageCount={3} onPageChange={() => {}} />
      </AdminI18nProvider>,
    );

    expect(await screen.findByRole("button", { name: "Kapatın" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Önceki", hidden: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sonraki", hidden: true })).toBeInTheDocument();
  });
});

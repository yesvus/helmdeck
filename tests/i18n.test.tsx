// SPDX-License-Identifier: MIT
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
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

function BindLocalePreferenceReader() {
  const { setInterfaceLocaleReader, refreshInterfaceLocalePreference } = useAdminInterfaceLocale();
  useEffect(() => {
    void setInterfaceLocaleReader(null).then(() => refreshInterfaceLocalePreference());
  }, [refreshInterfaceLocalePreference, setInterfaceLocaleReader]);
  return null;
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
    expect(getAdminMessages("fr", "xx")).toBe(englishAdminMessages);
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
      setReader: vi.fn(),
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
        <BindLocalePreferenceReader />
      </AdminI18nProvider>,
    );
    expect(await screen.findByText("Yönetim sayfalarında arayın")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "English" }));
    await waitFor(() => expect(preference.setLocale).toHaveBeenCalledWith("en"));
    expect(await screen.findByText("Search admin pages")).toBeInTheDocument();
  });

  it("loads a shared host preference without an auth provider", async () => {
    const preference = {
      setReader: vi.fn(),
      getLocale: vi.fn(() => "tr"),
      setLocale: vi.fn(),
    };
    render(
      <AdminI18nProvider localePreferenceAdapter={preference}>
        <MessageProbe />
      </AdminI18nProvider>,
    );
    expect(await screen.findByText("Yönetim sayfalarında arayın")).toBeInTheDocument();
    expect(preference.getLocale).toHaveBeenCalledTimes(1);
  });

  it("serializes host preference writes in the order the reader selects them", async () => {
    let finishFirst: () => void = () => {};
    const preference = {
      setReader: vi.fn(),
      getLocale: () => null,
      setLocale: vi.fn((locale: string) => locale === "tr"
        ? new Promise<void>((resolve) => { finishFirst = resolve; })
        : Promise.resolve()),
    };
    function WriteProbe() {
      const { setInterfaceLocale } = useAdminInterfaceLocale();
      return (
        <>
          <button onClick={() => void setInterfaceLocale("tr")}>Choose Turkish</button>
          <button onClick={() => void setInterfaceLocale("en")}>Choose English</button>
        </>
      );
    }
    render(<AdminI18nProvider localePreferenceAdapter={preference}><WriteProbe /></AdminI18nProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Choose Turkish" }));
    await waitFor(() => expect(preference.setLocale).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Choose English" }));
    await act(async () => Promise.resolve());
    expect(preference.setLocale.mock.calls.map(([locale]) => locale)).toEqual(["tr"]);
    await act(async () => finishFirst());
    await waitFor(() => expect(preference.setLocale.mock.calls.map(([locale]) => locale)).toEqual(["tr", "en"]));
  });

  it("drains queued writes before rebinding the host preference reader", async () => {
    let activeReader: string | null = null;
    let finishWrite: () => void = () => {};
    const writeReaders: Array<string | null> = [];
    const preference = {
      readerScoped: true,
      setReader: vi.fn((session: { userId?: string } | null) => { activeReader = session?.userId ?? null; }),
      getLocale: vi.fn(() => null),
      setLocale: vi.fn(() => new Promise<void>((resolve) => {
        writeReaders.push(activeReader);
        finishWrite = resolve;
      })),
    };
    function ReaderProbe() {
      const { setInterfaceLocale, setInterfaceLocaleReader, refreshInterfaceLocalePreference } = useAdminInterfaceLocale();
      return (
        <>
          <button onClick={() => void setInterfaceLocale("tr")}>Write for Ada</button>
          <button onClick={() => {
            void setInterfaceLocaleReader({ userId: "ada", email: "ada@example.com" })
              .then(() => refreshInterfaceLocalePreference());
          }}>Bind Ada</button>
          <button onClick={() => {
            void setInterfaceLocaleReader({ userId: "bob", email: "bob@example.com" })
              .then(() => refreshInterfaceLocalePreference());
          }}>Bind Bob</button>
        </>
      );
    }
    render(<AdminI18nProvider localePreferenceAdapter={preference}><ReaderProbe /></AdminI18nProvider>);
    expect(preference.getLocale).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Bind Ada" }));
    await waitFor(() => expect(activeReader).toBe("ada"));
    await act(async () => screen.getByRole("button", { name: "Write for Ada" }).click());
    await waitFor(() => expect(writeReaders).toEqual(["ada"]));
    fireEvent.click(screen.getByRole("button", { name: "Bind Bob" }));
    await act(async () => Promise.resolve());
    expect(activeReader).toBe("ada");
    await act(async () => finishWrite());
    await waitFor(() => expect(activeReader).toBe("bob"));
    expect(writeReaders).toEqual(["ada"]);
  });

  it("ignores a host preference read that resolves after a reader rebind", async () => {
    let finishFirstRead: (locale: string | null) => void = () => {};
    const preference = {
      readerScoped: true,
      setReader: vi.fn(),
      getLocale: vi.fn()
        .mockImplementationOnce(() => new Promise<string | null>((resolve) => { finishFirstRead = resolve; }))
        .mockResolvedValue(null),
      setLocale: vi.fn(),
    };
    function ReadProbe() {
      const { refreshInterfaceLocalePreference, setInterfaceLocaleReader } = useAdminInterfaceLocale();
      return (
        <>
          <button onClick={() => void refreshInterfaceLocalePreference()}>Read old preference</button>
          <button onClick={() => {
            void setInterfaceLocaleReader({ userId: "bob", email: "bob@example.com" })
              .then(() => refreshInterfaceLocalePreference());
          }}>Switch reader</button>
        </>
      );
    }
    render(
      <AdminI18nProvider localePreferenceAdapter={preference}>
        <MessageProbe />
        <ReadProbe />
      </AdminI18nProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Read old preference" }));
    await waitFor(() => expect(preference.getLocale).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Switch reader" }));
    await waitFor(() => expect(preference.getLocale).toHaveBeenCalledTimes(2));
    await act(async () => finishFirstRead("tr"));
    expect(screen.getByText("Search admin pages")).toBeInTheDocument();
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

  it("normalizes the selected option for a regional host locale", async () => {
    render(
      <AdminI18nProvider localeAdapter={{ getInterfaceLocale: () => "tr-TR", getContentLocale: () => "en" }}>
        <AdminLanguagePreference />
        <MessageProbe />
      </AdminI18nProvider>,
    );
    expect(await screen.findByText("Yönetim sayfalarında arayın")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Arayüz dili" })).toHaveValue("tr");
  });

  it("switches away from and back to a supplied dictionary with the picker", async () => {
    render(
      <AdminI18nProvider messages={turkishAdminMessages}>
        <AdminLanguagePreference />
        <MessageProbe />
      </AdminI18nProvider>,
    );
    const picker = screen.getByRole("combobox", { name: "Arayüz dili" });
    expect(screen.getByText("Yönetim sayfalarında arayın")).toBeInTheDocument();
    fireEvent.change(picker, { target: { value: "en" } });
    expect(await screen.findByText("Search admin pages")).toBeInTheDocument();
    fireEvent.change(picker, { target: { value: "tr" } });
    expect(await screen.findByText("Yönetim sayfalarında arayın")).toBeInTheDocument();
  });

  it("announces when the host cannot save a selected language", async () => {
    const preference = {
      setReader: vi.fn(),
      getLocale: () => "en",
      setLocale: vi.fn().mockRejectedValue(new Error("offline")),
    };
    render(
      <AdminI18nProvider localePreferenceAdapter={preference}>
        <AdminLanguagePreference />
        <BindLocalePreferenceReader />
      </AdminI18nProvider>,
    );
    const picker = await screen.findByRole("combobox", { name: "Interface language" });
    fireEvent.change(picker, { target: { value: "tr" } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Dil tercihi kaydedilemedi.");
  });

  it("announces when tab storage rejects a language preference", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("unavailable"); });
    render(
      <AdminI18nProvider>
        <AdminLanguagePreference />
      </AdminI18nProvider>,
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Interface language" }), { target: { value: "tr" } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Dil tercihi kaydedilemedi.");
  });

  it("does not show an older failed save after the latest selection saves", async () => {
    let rejectFirst: (cause: Error) => void = () => {};
    const preference = {
      setReader: vi.fn(),
      getLocale: () => null,
      setLocale: vi.fn((locale: string) => locale === "tr"
        ? new Promise<void>((_resolve, reject) => { rejectFirst = reject; })
        : Promise.resolve()),
    };
    render(
      <AdminI18nProvider localePreferenceAdapter={preference}>
        <AdminLanguagePreference />
      </AdminI18nProvider>,
    );
    const picker = await screen.findByRole("combobox", { name: "Interface language" });
    fireEvent.change(picker, { target: { value: "tr" } });
    await waitFor(() => expect(preference.setLocale).toHaveBeenCalledTimes(1));
    fireEvent.change(picker, { target: { value: "en" } });
    await act(async () => rejectFirst(new Error("offline")));
    await waitFor(() => expect(preference.setLocale).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
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

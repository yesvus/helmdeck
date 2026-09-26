// SPDX-License-Identifier: MIT
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  AdminI18nProvider,
  AdminModal,
  AdminModalContent,
  AdminModalTitle,
  AdminPagination,
  defaultAdminLocale,
  defineAdminMessages,
  englishAdminMessages,
  getAdminMessages,
  turkishAdminMessages,
  useAdminMessages,
  type AdminMessages,
} from "../src";

function MessageProbe() {
  const messages = useAdminMessages();
  return <p>{messages.shell.searchLabel}</p>;
}

describe("Helmdeck localization", () => {
  it("ships English and Turkish dictionaries", () => {
    expect(englishAdminMessages.locale).toBe("en");
    expect(turkishAdminMessages.locale).toBe("tr");
    expect(turkishAdminMessages.shell.searchLabel).toBe("Yönetim sayfalarında arayın");
    expect(turkishAdminMessages.media.browse).toBe("Dosya seçiniz");
    expect(englishAdminMessages.media.total).toBe("total");
    expect(turkishAdminMessages.media.total).toBe("toplam");
  });

  it("defaults to Turkish and resolves regional fallbacks", () => {
    expect(defaultAdminLocale).toBe("tr");
    expect(getAdminMessages("fr")).toBe(turkishAdminMessages);
    expect(getAdminMessages("fr", "tr-TR")).toBe(turkishAdminMessages);
    expect(getAdminMessages("EN-US")).toBe(englishAdminMessages);
    expect(getAdminMessages("TR-tr")).toBe(turkishAdminMessages);

    render(
      <AdminI18nProvider>
        <MessageProbe />
      </AdminI18nProvider>,
    );

    expect(screen.getByText("Yönetim sayfalarında arayın")).toBeInTheDocument();
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
    expect(screen.getByText("Administrationsseiten durchsuchen")).toBeInTheDocument();
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

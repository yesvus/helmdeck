"use client";

import { AdminShell, type AdminNavGroup, type AdminSession } from "@yesvus/helmdeck";

const nav: AdminNavGroup[] = [
  {
    label: "İçerik",
    items: [
      { href: "/locale", label: "Genel bakış" },
      { href: "/locale/urunler", label: "Ürünler" },
    ],
  },
  {
    label: "Ayarlar",
    items: [{ href: "/locale/ayarlar", label: "Site ayarları", roles: ["owner"] }],
  },
];

const session: AdminSession = { name: "Deniz Aydın", email: "deniz@example.com", role: "owner" };

export default function LocaleOverviewPage() {
  return (
    <AdminShell nav={nav} session={session} homeHref="/locale" showTopbar>
      <div className="space-y-3 p-6">
        <h1 className="text-2xl font-black">Arayüz dili Türkçe, içerik dili İngilizce</h1>
        <p className="text-sm text-zinc-600">
          Yukarıdaki gezinme bağlantıları <code>?locale=</code> değerini korur. Bir ürüne gittiğinizde
          arayüz dili değişmez, içerik dili korunur.
        </p>
        <p className="text-sm text-zinc-600">
          The switcher below changes content locale only. Interface messages stay Turkish.
        </p>
      </div>
    </AdminShell>
  );
}

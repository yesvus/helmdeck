// SPDX-License-Identifier: MIT

import type { AdminMediaLabels } from "../media/labels.js";
import type { AdminMediaSort } from "../media/utils.js";
import { defaultAdminMediaLabels } from "../media/labels.js";
import {
  defaultAdminLabels,
  type AdminShellLabels,
} from "../shell/labels.js";
import {
  defaultAdminManagedFormFeedbackLabels,
  defaultPaginationLabels,
  defaultSortableMessages,
  type AdminManagedFormFeedbackLabels,
  type AdminPaginationLabels,
  type AdminSortableMessages,
} from "../primitives/messages.js";

export type AdminDestructiveActionLabels = {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  busyLabel: string;
};

export type AdminStatusLabels = {
  published: string;
  draft: string;
};

export type AdminCommonLabels = {
  close: string;
  dismiss: string;
  tableEmpty: string;
  image: string;
  pdfDocument: string;
  mediaDescription: string;
  removeItem: (label: string, index: number) => string;
};

export type AdminMessages = {
  locale: string;
  searchLocale: string;
  shell: AdminShellLabels;
  media: AdminMediaLabels;
  form: AdminManagedFormFeedbackLabels & { assetTitle: string; pendingLabel: string };
  sortable: AdminSortableMessages;
  destructive: AdminDestructiveActionLabels;
  status: AdminStatusLabels;
  common: AdminCommonLabels;
  pagination: AdminPaginationLabels;
  mediaSort: Record<AdminMediaSort, string>;
};

export const englishAdminMessages: AdminMessages = {
  locale: "en",
  searchLocale: "en-US",
  shell: defaultAdminLabels,
  media: defaultAdminMediaLabels,
  form: {
    ...defaultAdminManagedFormFeedbackLabels,
    assetTitle: "Uploaded file URL",
    pendingLabel: "Saving...",
  },
  sortable: defaultSortableMessages,
  destructive: {
    title: "Delete this item?",
    description: "This action cannot be undone.",
    confirmLabel: "Yes, delete",
    cancelLabel: "Cancel",
    busyLabel: "Working...",
  },
  status: {
    published: "Published",
    draft: "Draft",
  },
  common: {
    close: "Close",
    dismiss: "Dismiss notification",
    tableEmpty: "No results.",
    image: "Image",
    pdfDocument: "PDF document",
    mediaDescription: "Media description",
    removeItem: (label, index) => `Remove ${label.toLocaleLowerCase()} ${index}`,
  },
  pagination: defaultPaginationLabels,
  mediaSort: {
    "date-desc": "Newest first",
    "date-asc": "Oldest first",
    "name-asc": "Name A to Z",
    "name-desc": "Name Z to A",
    "size-desc": "Largest first",
    "size-asc": "Smallest first",
    kind: "File type",
  },
};

export const turkishAdminMessages: AdminMessages = {
  locale: "tr",
  searchLocale: "tr-TR",
  shell: {
    sidebarExpand: "Menüyü genişletiniz",
    sidebarCollapse: "Menüyü daraltınız",
    brandLabel: "Yönetim",
    searchLabel: "Yönetim sayfalarında arayın",
    searchPlaceholder: "Sayfa ve ayarlarda arayın",
    searchHint: "Arayın (Ctrl/⌘ K)",
    searchNoResults: "Eşleşen sayfa veya ayar bulunamadı.",
    mobileMore: "Daha fazla",
    breadcrumbLabel: "Site yolu",
    segmentNew: "Yeni",
    profileMenu: "Profil menüsü",
    profile: "Profil",
    viewSite: "Siteyi görüntüleyin",
    signOut: "Çıkış yapın",
    loginEmail: "E-posta",
    loginPassword: "Şifre",
    loginSubmit: "Giriş yapın",
    loginBack: "Siteye dönün",
  },
  media: {
    ...defaultAdminMediaLabels,
    description: "Kütüphaneden seçiniz. Seçtiğiniz dosya veya medya bu alana otomatik eklenir.",
    searchPlaceholder: "Medya adıyla arayın",
    searchLabel: "Medya arayın",
    sortLabel: "Sıralama ölçütü",
    upload: "Yeni medya ekleyiniz",
    hideUpload: "Eklemeyi gizleyiniz",
    closeUpload: "Medya ekleme panelini kapatınız",
    previousMedia: "Önceki medya",
    nextMedia: "Sonraki medya",
    file: "Dosya",
    external: "Bağlantı",
    externalUrl: "YouTube bağlantısı",
    externalName: "Medya adı",
    addExternal: "Bağlantıyı ekleyiniz",
    empty: "Bu alana uygun medya bulunamadı.",
    loading: "Medya yükleniyor...",
    loadMore: "Daha fazla medya yükleyiniz",
    loadError: "Medya yüklenemedi.",
    retry: "Yeniden deneyiniz",
    results: "medya",
    total: "toplam",
    select: "Medya seçiniz",
    replace: "Medyayı değiştiriniz",
    clear: "Medyayı temizleyiniz",
    recommendedRatio: "Önerilen oran",
    drop: "Dosyayı buraya bırakın veya seçiniz",
    browse: "Dosya seçiniz",
    startUpload: "Dosyayı yükleyiniz",
    uploading: "Yükleniyor",
    uploadSuccess: "Yükleme tamamlandı",
    uploadError: "Dosya yüklenemedi",
    sourceLocal: "Site dosyası",
    sourceUploaded: "Yüklenen medya",
    sourceYoutube: "YouTube bağlantısı",
    sourceExternal: "Harici medya",
  },
  form: {
    successTitle: "İşlem tamamlandı",
    errorTitle: "İşlem tamamlanamadı",
    assetTitle: "Yüklenen dosya URL",
    pendingLabel: "Kaydediliyor...",
  },
  sortable: {
    ...defaultSortableMessages,
    reorderFailed: "Sıra güncellenemedi. Lütfen tekrar deneyiniz.",
    toastSuccessTitle: "Sıra güncellendi",
    toastErrorTitle: "Sıra güncellenemedi",
    announcements: {
      dragStart: (id) => `Taşıma başladı: sıradaki öğe ${id}.`,
      dragOver: (id, overId) => `${id} öğesi ${overId} konumunun üzerinde.`,
      dragEnd: (id) => `${id} öğesi yeni konuma taşındı.`,
      dragCancel: (id) => `${id} taşıma işlemi iptal edildi.`,
    },
  },
  destructive: {
    title: "İçeriği silmek istiyor musunuz?",
    description: "Bu işlem geri alınamaz.",
    confirmLabel: "Evet, siliniz",
    cancelLabel: "Vazgeçiniz",
    busyLabel: "İşleniyor...",
  },
  status: {
    published: "Yayında",
    draft: "Taslak",
  },
  common: {
    close: "Kapatın",
    dismiss: "Bildirimi kapatın",
    tableEmpty: "Sonuç bulunamadı.",
    image: "Görsel",
    pdfDocument: "PDF belgesi",
    mediaDescription: "Medya açıklaması",
    removeItem: (label, index) => `${label.toLocaleLowerCase("tr-TR")} ${index} öğesini kaldırın`,
  },
  pagination: {
    nav: "Sayfalama",
    previous: "Önceki",
    next: "Sonraki",
    page: (page) => `Sayfa ${page}`,
    more: "Diğer sayfalar",
  },
  mediaSort: {
    "date-desc": "En yeniden eskiye",
    "date-asc": "Eskiden yeniye",
    "name-asc": "Ada A'dan Z'ye",
    "name-desc": "Ada Z'den A'ya",
    "size-desc": "Boyutu büyükten küçüğe",
    "size-asc": "Boyutu küçükten büyüğe",
    kind: "Dosya türü",
  },
};

export const defaultAdminLocale = "tr";

const registry = new Map<string, AdminMessages>([
  [englishAdminMessages.locale, englishAdminMessages],
  [turkishAdminMessages.locale, turkishAdminMessages],
]);

export function defineAdminMessages(messages: AdminMessages) {
  registry.set(messages.locale.toLowerCase(), messages);
  return messages;
}

export function getAdminMessages(locale: string, fallbackLocale = defaultAdminLocale) {
  const normalizedLocale = locale.toLowerCase();
  const normalizedFallback = fallbackLocale.toLowerCase();
  return (
    registry.get(normalizedLocale) ??
    registry.get(normalizedLocale.split("-")[0]) ??
    registry.get(normalizedFallback) ??
    registry.get(normalizedFallback.split("-")[0]) ??
    turkishAdminMessages
  );
}

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
import { defaultCollectionMessages, type AdminCollectionMessages } from "../collections/messages.js";
import { defaultWidgetMessages, type AdminWidgetMessages } from "../widgets/messages.js";
import {
  defaultAdminShippedWidgetLabels,
  type AdminShippedWidgetLabels,
} from "../widgets/labels.js";
import { defaultDashboardMessages, type AdminDashboardMessages } from "../dashboard/messages.js";
import {
  defaultAdminActivityMessages,
  turkishAdminActivityMessages,
  type AdminActivityMessages,
} from "../activity/messages.js";
import {
  defaultAdminInboxMessages,
  turkishAdminInboxMessages,
  type AdminInboxMessages,
} from "../inbox/messages.js";
import {
  defaultAdminAnalyticsChartMessages,
  turkishAdminAnalyticsChartMessages,
  type AdminAnalyticsChartMessages,
} from "../charts/analytics-messages.js";

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
  tableAction: string;
  options: string;
  search: string;
  ascending: string;
  descending: string;
  columns: string;
  resize: string;
  pin: string;
  pinLeft: string;
  pinRight: string;
  image: string;
  pdfDocument: string;
  document: string;
  mediaDescription: string;
  removeItem: (label: string, index: number) => string;
};

export type AdminMessages = {
  locale: string;
  searchLocale: string;
  languagePreference: {
    label: string;
    description: string;
    saveFailed: string;
  };
  themePreference: {
    label: string;
    light: string;
    dark: string;
    system: string;
  };
  shell: AdminShellLabels;
  media: AdminMediaLabels;
  form: AdminManagedFormFeedbackLabels & { assetTitle: string; pendingLabel: string };
  sortable: AdminSortableMessages;
  collection: AdminCollectionMessages;
  widget: AdminWidgetMessages;
  /** The words the shipped tiles print themselves, which a tile cannot read from a context. */
  shippedWidget: AdminShippedWidgetLabels;
  dashboard: AdminDashboardMessages;
  /** The words the activity trail prints itself, which a trail cannot read from a context. */
  activity?: AdminActivityMessages;
  inbox?: AdminInboxMessages;
  analyticsCharts?: AdminAnalyticsChartMessages;
  destructive: AdminDestructiveActionLabels;
  status: AdminStatusLabels;
  common: AdminCommonLabels;
  pagination: AdminPaginationLabels;
  mediaSort: Record<AdminMediaSort, string>;
};

export const englishAdminMessages: AdminMessages = {
  locale: "en",
  searchLocale: "en-US",
  languagePreference: {
    label: "Interface language",
    description: "Choose the language used throughout the admin.",
    saveFailed: "The language preference could not be saved.",
  },
  themePreference: {
    label: "Color mode",
    light: "Light",
    dark: "Dark",
    system: "System",
  },
  shell: defaultAdminLabels,
  media: defaultAdminMediaLabels,
  form: {
    ...defaultAdminManagedFormFeedbackLabels,
    assetTitle: "Uploaded file URL",
    pendingLabel: "Saving...",
  },
  sortable: defaultSortableMessages,
  collection: defaultCollectionMessages,
  widget: defaultWidgetMessages,
  shippedWidget: defaultAdminShippedWidgetLabels,
  dashboard: defaultDashboardMessages,
  activity: defaultAdminActivityMessages,
  inbox: defaultAdminInboxMessages,
  analyticsCharts: defaultAdminAnalyticsChartMessages,
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
    tableAction: "Table action",
    options: "Options",
    search: "Search",
    ascending: "ascending",
    descending: "descending",
    columns: "Columns",
    resize: "Resize",
    pin: "Pin",
    pinLeft: "Left",
    pinRight: "Right",
    image: "Image",
    pdfDocument: "PDF document",
    document: "Document",
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
  languagePreference: {
    label: "Arayüz dili",
    description: "Yönetim arayüzünde kullanılacak dili seçin.",
    saveFailed: "Dil tercihi kaydedilemedi.",
  },
  themePreference: {
    label: "Renk modu",
    light: "Açık",
    dark: "Koyu",
    system: "Sistem",
  },
  shell: {
    sidebarExpand: "Menüyü genişletiniz",
    sidebarCollapse: "Menüyü daraltınız",
    brandLabel: "Yönetim",
    searchLabel: "Yönetim sayfalarında arayın",
    searchPlaceholder: "Sayfa ve ayarlarda arayın",
    searchHint: "Arayın (Ctrl/⌘ K)",
    searchNoResults: "Eşleşen sayfa veya ayar bulunamadı.",
    recordSearchOpen: "Kayıtları arayın",
    recordSearchLabel: "Kayıtları arayın",
    recordSearchPlaceholder: "Kaynaklar arasında kayıt arayın",
    recordSearchHint: "Kayıtları arayın (Ctrl/⌘ Shift K)",
    recordSearchResultsLabel: "Kayıt arama sonuçları",
    recordSearchNoResults: "Eşleşen kayıt bulunamadı.",
    recordSearchLoading: "Kayıtlar aranıyor.",
    recordSearchOneResult: "1 sonuç",
    recordSearchManyResults: "{count} sonuç",
    recordSearchClose: "Kayıt aramasını kapatın",
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
    authChecking: "Oturumunuz denetleniyor.",
    authRedirecting: "Bu sayfayı görüntülemek için giriş yapmanız gerekiyor.",
    authSignInLink: "Giriş sayfasına gidin",
    authSessionError: "Oturumunuz denetlenemedi. Yeniden deneyin.",
    profileIdentity: "Kimlik",
    profileName: "Ad",
    profileEmail: "E-posta",
    profileRole: "Rol",
    profileSessions: "Açık oturumlar",
    profileSessionsDescription: "Bu hesaba şu anda giriş yapmış cihazlar.",
    profileNoOtherSessions: "Başka oturum yok.",
    profileSessionStarted: "Başlangıç",
    signOutEverywhere: "Her yerden çıkış yapın",
    settings: "Ayarlar",
    settingsDescription: "Bu hesabın tercihleri.",
    settingsOpen: "Ayarları açın",
    permissionDenied: "Bu içeriğe erişim izniniz yok.",
    resourceActions: "İşlemler",
    resourceNew: "Yeni",
    resourceEdit: "Düzenleyin",
    resourceDelete: "Silin",
    resourceDeleteTitle: "Bu kayıt silinsin mi?",
    resourceEmpty: "Burada henüz bir şey yok.",
    resourceEmptyBody: "Kayıtlar oluşturulduktan sonra burada görünecek.",
    resourceLoadError: "Bu kayıtlar yüklenemedi.",
    resourceDeleteFailed: "Bu kayıt silinemedi.",
    resourceNotFound: "Bu kayıt artık yok.",
    resourceSaveFailed: "Bu değişiklik kaydedilemedi.",
    resourceFieldRequired: "Bu alan zorunludur.",
    resourceSave: "Kaydedin",
    resourceSaving: "Kaydediliyor...",
    resourceCancel: "Vazgeçin",
    resourceLoading: "Yükleniyor...",
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
    preview: "Görseli önizleyin",
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
    libraryUnavailable: "Bu sitede medya deposu bağlı değil, bu yüzden burada görüntülenecek bir şey yok.",
    libraryTitle: "Medya",
    libraryDescription: "Sitenizin yüklediği veya bağladığı her şey ve üzerinde yapabileceğiniz işlemler.",
    libraryOpen: "Bu dosyayı yeni sekmede açınız",
    libraryNotNavigable: "Bu adres güvenle açılamadığı için bu varlık bağlantısız gösterilmektedir",
    kindFilter: "Türe göre filtreleyiniz",
    allKinds: "Tüm türler",
    kinds: {
      image: "Görsel",
      video: "Video",
      pdf: "PDF",
      youtube: "YouTube",
      other: "Diğer",
    },
    delete: "Siliniz",
    deleteTitle: "Bu varlık silinsin mi?",
    deleteDescription: "Dosya medya deposundan kaldırılır. Hâlâ bu dosyayı gösteren bir kayıt onu bulamaz.",
    deleteConfirm: "Evet, siliniz",
    deleteBusy: "Siliniyor...",
    deleteFailed: "Bu varlık silinemedi.",
    deleted: "Silindi",
    libraryEmptyBody: "Bir varlık, bir şey yüklendiğinde ya da arama ve filtre temizlendiğinde burada görünür.",
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
  dashboard: {
    empty: "Bu panoda henüz bileşen yok.",
    missingWidget: (widget) => `Bu pano, bu sürümde bulunmayan "${widget}" bileşenine başvuruyor.`,
  },
  activity: turkishAdminActivityMessages,
  inbox: turkishAdminInboxMessages,
  analyticsCharts: turkishAdminAnalyticsChartMessages,
  widget: {
    emptyTitle: "Gösterilecek veri yok",
    emptyBody: "Bu bileşen için henüz veri yok.",
    errorTitle: "Bu bileşen yüklenemedi",
    retry: "Tekrar dene",
  },
  shippedWidget: {
    capNote: (shown, total) => `${total} kaydın ${shown} tanesi gösteriliyor`,
    justNow: "Az önce",
    minutesAgo: (count) => `${count} dakika önce`,
    hoursAgo: (count) => `${count} saat önce`,
    daysAgo: (count) => `${count} gün önce`,
    ageDate: (date) =>
      new Intl.DateTimeFormat("tr-TR", { month: "short", day: "numeric", year: "numeric" }).format(date),
    unknownTime: "Zamanı bilinmiyor",
    trendUp: "Artış",
    trendDown: "Düşüş",
  },
  collection: {
    add: "Ekle",
    remove: "Kaldır",
    duplicate: "Çoğalt",
    edit: "Düzenle",
    emptyTitle: "Henüz bir şey yok",
    emptyBody: "Başlamak için ilk kaydı ekleyin.",
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
    tableAction: "Tablo işlemi",
    options: "Seçenekler",
    search: "Ara",
    ascending: "artan",
    descending: "azalan",
    columns: "Sütunlar",
    resize: "Boyutlandır",
    pin: "Sabitle",
    pinLeft: "Sola",
    pinRight: "Sağa",
    image: "Görsel",
    pdfDocument: "PDF belgesi",
    document: "Belge",
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

export const defaultAdminLocale = "en";

const registry = new Map<string, AdminMessages>([
  [englishAdminMessages.locale, englishAdminMessages],
  [turkishAdminMessages.locale, turkishAdminMessages],
]);

export function defineAdminMessages(messages: AdminMessages) {
  registry.set(messages.locale.toLowerCase(), messages);
  return messages;
}

export function getAdminMessageLocales() {
  return [...registry.values()].map(({ locale }) => locale);
}

export function getAdminMessages(locale: string, fallbackLocale = defaultAdminLocale) {
  const normalizedLocale = locale.toLowerCase();
  const normalizedFallback = fallbackLocale.toLowerCase();
  return (
    registry.get(normalizedLocale) ??
    registry.get(normalizedLocale.split("-")[0]) ??
    registry.get(normalizedFallback) ??
    registry.get(normalizedFallback.split("-")[0]) ??
    registry.get(defaultAdminLocale) ??
    englishAdminMessages
  );
}

// SPDX-License-Identifier: MIT

/** The words the activity trail prints itself, in one place so a host replaces them together. */
export type AdminActivityMessages = {
  title: string;
  description: string;
  filters: string;
  action: string;
  allActions: string;
  actor: string;
  actorPlaceholder: string;
  from: string;
  to: string;
  apply: string;
  clear: string;
  loading: string;
  loadFailed: string;
  empty: string;
  emptyBody: string;
  noMatches: string;
  noMatchesBody: string;
  details: string;
  hideDetails: string;
  detailsEmpty: string;
  resource: string;
  record: string;
  fields: string;
  unknownActor: string;
  emptyValue: string;
  showing: (shown: number, total: number) => string;
  showMore: (remaining: number) => string;
};

export const defaultAdminActivityMessages: AdminActivityMessages = {
  title: "Activity",
  description: "What changed, who changed it, and when.",
  filters: "Filters",
  action: "Action",
  allActions: "All actions",
  actor: "Actor",
  actorPlaceholder: "Name, email or role",
  from: "From",
  to: "To",
  apply: "Apply",
  clear: "Clear filters",
  loading: "The activity trail is loading.",
  loadFailed: "The activity trail could not be loaded.",
  empty: "No activity yet",
  emptyBody: "Recorded changes appear here as soon as something is written.",
  noMatches: "No activity matches these filters",
  noMatchesBody: "Clear a filter, or widen the dates, to see more.",
  details: "Details",
  hideDetails: "Hide details",
  detailsEmpty: "This event carries no metadata.",
  resource: "Resource",
  record: "Record",
  fields: "Fields",
  unknownActor: "Unknown actor",
  emptyValue: "(empty)",
  showing: (shown, total) => `Showing ${shown} of ${total} events`,
  showMore: (remaining) => `Show ${remaining} more`,
};

export const turkishAdminActivityMessages: AdminActivityMessages = {
  title: "Etkinlik",
  description: "Neyin değiştiği, kimin değiştirdiği ve ne zaman.",
  filters: "Filtreler",
  action: "İşlem",
  allActions: "Tüm işlemler",
  actor: "Kişi",
  actorPlaceholder: "Ad, e-posta veya rol",
  from: "Başlangıç",
  to: "Bitiş",
  apply: "Uygula",
  clear: "Filtreleri temizle",
  loading: "Etkinlik kaydı yükleniyor.",
  loadFailed: "Etkinlik kaydı yüklenemedi.",
  empty: "Henüz etkinlik yok",
  emptyBody: "Bir şey yazıldığı anda kaydedilen değişiklikler burada görünür.",
  noMatches: "Bu filtrelere uyan etkinlik yok",
  noMatchesBody: "Daha fazlası için bir filtreyi temizleyin veya tarihleri genişletin.",
  details: "Ayrıntılar",
  hideDetails: "Ayrıntıları gizle",
  detailsEmpty: "Bu olayda meta veri yok.",
  resource: "Kaynak",
  record: "Kayıt",
  fields: "Alanlar",
  unknownActor: "Bilinmeyen kişi",
  emptyValue: "(boş)",
  showing: (shown, total) => `${total} olaydan ${shown} tanesi gösteriliyor`,
  showMore: (remaining) => `${remaining} olay daha göster`,
};
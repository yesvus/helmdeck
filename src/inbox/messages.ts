// SPDX-License-Identifier: MIT

export type AdminInboxMessages = {
  loading: string;
  emptyTitle: string;
  emptyBody: string;
  unread: string;
  read: string;
  archived: string;
  markRead: string;
  archive: string;
  actionFailed: string;
  sender: string;
  received: string;
  back: string;
  message: string;
};

export const defaultAdminInboxMessages: AdminInboxMessages = {
  loading: "Messages are loading.",
  emptyTitle: "No messages yet",
  emptyBody: "New messages will appear here.",
  unread: "Unread",
  read: "Read",
  archived: "Archived",
  markRead: "Mark as read",
  archive: "Archive",
  actionFailed: "This message could not be updated.",
  sender: "From",
  received: "Received",
  back: "Back to messages",
  message: "Message",
};

export const turkishAdminInboxMessages: AdminInboxMessages = {
  loading: "Mesajlar yükleniyor.",
  emptyTitle: "Henüz mesaj yok",
  emptyBody: "Yeni mesajlar burada görünecek.",
  unread: "Okunmadı",
  read: "Okundu",
  archived: "Arşivlendi",
  markRead: "Okundu olarak işaretle",
  archive: "Arşivle",
  actionFailed: "Bu mesaj güncellenemedi.",
  sender: "Gönderen",
  received: "Alınma zamanı",
  back: "Mesajlara dön",
  message: "Mesaj",
};

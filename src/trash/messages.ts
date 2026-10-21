// SPDX-License-Identifier: MIT

export type AdminTrashMessages = {
  title: string;
  description: string;
  emptyTitle: string;
  emptyBody: string;
  loading: string;
  item: string;
  resource: string;
  deletedAt: string;
  deletedBy: string;
  restore: string;
  purge: string;
  restoreSelected: string;
  purgeSelected: string;
  selectedCount: (count: number) => string;
  selectItem: string;
  selectAll: string;
  confirmPurgeTitle: string;
  confirmPurgeDescription: string;
  confirmPurgeSelectedTitle: string;
  confirmPurgeSelectedDescription: (count: number) => string;
  confirmLabel: string;
  cancelLabel: string;
  busyLabel: string;
  actionFailed: string;
  restored: string;
  purged: string;
  restoredMany: (count: number) => string;
  purgedMany: (count: number) => string;
};

export const defaultAdminTrashMessages: AdminTrashMessages = {
  title: "Trash",
  description: "Restore removed records or permanently delete them.",
  emptyTitle: "The trash is empty",
  emptyBody: "Removed records will appear here.",
  loading: "Trash is loading.",
  item: "Item",
  resource: "Resource",
  deletedAt: "Deleted",
  deletedBy: "Deleted by",
  restore: "Restore",
  purge: "Purge",
  restoreSelected: "Restore selected",
  purgeSelected: "Purge selected",
  selectedCount: (count) => `${count} selected`,
  selectItem: "Select",
  selectAll: "Select all trashed records",
  confirmPurgeTitle: "Permanently delete this record?",
  confirmPurgeDescription: "This action cannot be undone.",
  confirmPurgeSelectedTitle: "Permanently delete selected records?",
  confirmPurgeSelectedDescription: (count) => `This permanently deletes ${count} records and cannot be undone.`,
  confirmLabel: "Purge permanently",
  cancelLabel: "Cancel",
  busyLabel: "Purging…",
  actionFailed: "The action could not be completed. Try again.",
  restored: "Record restored.",
  purged: "Record permanently deleted.",
  restoredMany: (count) => `${count} records restored.`,
  purgedMany: (count) => `${count} records permanently deleted.`,
};

export const turkishAdminTrashMessages: AdminTrashMessages = {
  title: "Çöp Kutusu",
  description: "Silinen kayıtları geri yükleyin veya kalıcı olarak silin.",
  emptyTitle: "Çöp kutusu boş",
  emptyBody: "Silinen kayıtlar burada görünür.",
  loading: "Çöp kutusu yükleniyor.",
  item: "Kayıt",
  resource: "Kaynak",
  deletedAt: "Silinme tarihi",
  deletedBy: "Silen kişi",
  restore: "Geri yükle",
  purge: "Kalıcı olarak sil",
  restoreSelected: "Seçilenleri geri yükle",
  purgeSelected: "Seçilenleri kalıcı olarak sil",
  selectedCount: (count) => `${count} kayıt seçildi`,
  selectItem: "Seç",
  selectAll: "Çöp kutusundaki tüm kayıtları seç",
  confirmPurgeTitle: "Bu kayıt kalıcı olarak silinsin mi?",
  confirmPurgeDescription: "Bu işlem geri alınamaz.",
  confirmPurgeSelectedTitle: "Seçilen kayıtlar kalıcı olarak silinsin mi?",
  confirmPurgeSelectedDescription: (count) => `${count} kayıt kalıcı olarak silinecek. Bu işlem geri alınamaz.`,
  confirmLabel: "Kalıcı olarak sil",
  cancelLabel: "İptal",
  busyLabel: "Siliniyor…",
  actionFailed: "İşlem tamamlanamadı. Lütfen tekrar deneyin.",
  restored: "Kayıt geri yüklendi.",
  purged: "Kayıt kalıcı olarak silindi.",
  restoredMany: (count) => `${count} kayıt geri yüklendi.`,
  purgedMany: (count) => `${count} kayıt kalıcı olarak silindi.`,
};

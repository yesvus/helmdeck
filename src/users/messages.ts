// SPDX-License-Identifier: MIT

export type AdminUserManagementMessages = {
  title: string;
  description: string;
  accounts: string;
  accountCount: (count: number) => string;
  name: string;
  email: string;
  role: string;
  status: string;
  active: string;
  disabled: string;
  created: string;
  lastActivity: string;
  noActivity: string;
  recentActivity: string;
  noRecentActivity: string;
  saveRole: string;
  saved: string;
  enable: string;
  disable: string;
  confirmDisable: string;
  confirmDisableBody: string;
  cancel: string;
  resetPassword: string;
  resetRequested: string;
  sessions: string;
  expires: string;
  currentSession: string;
  endSession: string;
  sessionEnded: string;
  noSessions: string;
  noAccounts: string;
  operationFailed: string;
  noRole: string;
};

export const defaultAdminUserManagementMessages: AdminUserManagementMessages = {
  title: "User management",
  description: "Manage accounts, access, sessions, and user activity.",
  accounts: "Accounts",
  accountCount: (count) => `${count} accounts`,
  name: "Name",
  email: "Email",
  role: "Role",
  status: "Status",
  active: "Active",
  disabled: "Disabled",
  created: "Created",
  lastActivity: "Last activity",
  noActivity: "No recorded activity",
  recentActivity: "Recent actions",
  noRecentActivity: "No recent actions for this user.",
  saveRole: "Save role",
  saved: "Changes saved.",
  enable: "Enable account",
  disable: "Disable account",
  confirmDisable: "Confirm disable",
  confirmDisableBody: "Disabling this account ends its active sessions.",
  cancel: "Cancel",
  resetPassword: "Send password reset",
  resetRequested: "Password reset requested.",
  sessions: "Active sessions",
  expires: "Expires",
  currentSession: "This session",
  endSession: "End session",
  sessionEnded: "Session ended.",
  noSessions: "No active sessions.",
  noAccounts: "No accounts to manage.",
  operationFailed: "The operation could not be completed.",
  noRole: "No role",
};

export const turkishAdminUserManagementMessages: AdminUserManagementMessages = {
  title: "Kullanıcı yönetimi",
  description: "Hesapları, erişimi, oturumları ve kullanıcı etkinliklerini yönetin.",
  accounts: "Hesaplar",
  accountCount: (count) => `${count} hesap`,
  name: "Ad",
  email: "E-posta",
  role: "Rol",
  status: "Durum",
  active: "Etkin",
  disabled: "Devre dışı",
  created: "Oluşturulma",
  lastActivity: "Son etkinlik",
  noActivity: "Kaydedilmiş etkinlik yok",
  recentActivity: "Son işlemler",
  noRecentActivity: "Bu kullanıcı için yakın zamanda işlem yok.",
  saveRole: "Rolü kaydet",
  saved: "Değişiklikler kaydedildi.",
  enable: "Hesabı etkinleştir",
  disable: "Hesabı devre dışı bırak",
  confirmDisable: "Devre dışı bırakmayı onayla",
  confirmDisableBody: "Bu hesabı devre dışı bırakmak etkin oturumları sonlandırır.",
  cancel: "İptal",
  resetPassword: "Parola sıfırlama gönder",
  resetRequested: "Parola sıfırlama isteği gönderildi.",
  sessions: "Etkin oturumlar",
  expires: "Son kullanma",
  currentSession: "Bu oturum",
  endSession: "Oturumu sonlandır",
  sessionEnded: "Oturum sonlandırıldı.",
  noSessions: "Etkin oturum yok.",
  noAccounts: "Yönetilecek hesap yok.",
  operationFailed: "İşlem tamamlanamadı.",
  noRole: "Rol yok",
};

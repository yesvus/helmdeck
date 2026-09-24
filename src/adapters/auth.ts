// SPDX-License-Identifier: MIT
import type { AdminSession } from "./session.js";

export type AdminLoginCredentials = {
  email: string;
  password: string;
};

export type AdminLoginResult =
  | { ok: true; session: AdminSession }
  | { ok: false; message: string };

export type AdminAuthAdapter = {
  getSession: () => Promise<AdminSession | null>;
  login: (credentials: AdminLoginCredentials) => Promise<AdminLoginResult>;
  logout: () => Promise<void>;
};

// SPDX-License-Identifier: MIT
export type AdminSession = {
  /**
   * The session row's id, when the adapter that resolved this one has one to give.
   *
   * It is the handle a revocation names, so a host listing sessions can point at the caller's own
   * row and the account surface's `endSession` can be called with a value it holds rather than one a
   * caller wrote. Nothing in the cookie carries it, it is read from the row the id in the cookie
   * points at, and a request cannot name it.
   *
   * Optional because a host's own `AdminAuthAdapter` need not have a session table at all: a token
   * with a jti does, a single shared secret does not. A host that reaches for `session.id` on a type
   * that says `string | undefined` is being told the truth, and `createCredentialAuthAdapter` fills
   * it in only when the host asks, with `includeSessionId`.
   */
  id?: string;
  email: string;
  name?: string;
  role?: string;
};

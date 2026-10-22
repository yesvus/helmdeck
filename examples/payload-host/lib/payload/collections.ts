// SPDX-License-Identifier: MIT
/**
 * Payload's collections: the accounts this host signs people in with, and the content it edits.
 *
 * Two collections, because the arrangement under test is the seam and not a CMS. The accounts
 * collection is the arrangement: it is where the role lives, it is what the panel authenticates
 * against, and it is what the host's session resolves to.
 */

import type { CollectionConfig } from "payload";
import { payloadAccess } from "./access";
import { payloadAuthStrategies } from "./auth-strategy";
import { isAdmin, principal } from "../rules";

/**
 * The accounts, which are Payload's own auth collection.
 *
 * The local strategy stays on, because the host's sign-in is Payload's own login operation and
 * nothing else checks a password here. What is switched off is the *response*: the token is
 * removed from it, so Payload's REST login endpoint verifies a password and hands back nothing
 * that could be used. The only way into this host is its own form.
 *
 * `strategies` is this host's session, so the panel is entered with the session the host already
 * has rather than with a second one.
 */
export const Users: CollectionConfig = {
  slug: "users",
  admin: {
    useAsTitle: "email",
    group: "People",
    description: "The accounts this host signs people in with. The role decides what each may do.",
  },
  auth: {
    removeTokenFromResponses: true,
    /**
     * Payload's own lockout, because the local strategy leaves a login endpoint on the REST API.
     *
     * The endpoint verifies a password and returns no token, so it is a place an unbounded guess
     * would go: the answer is in the status code. The lockout is what bounds it, and it is shared
     * between the instances of a deployment, which a per-process counter is not. The host's own
     * throttle is the layer under it, per client.
     */
    maxLoginAttempts: 10,
    strategies: payloadAuthStrategies,
  },
  access: {
    /**
     * An account may read its own row, and an administrator may read every row.
     *
     * The filter rather than a plain yes, because the session read needs to find the account it
     * names, and a session names an account rather than a permission to list them.
     */
    read: ({ req: { user } }) => {
      const account = principal(user);
      if (!account) return false;
      if (isAdmin(account)) return true;
      return { id: { equals: account.id } };
    },
    /**
     * Every write to an account is an administrator's.
     *
     * An account is a role, so writing one is writing a permission: an editor who could create an
     * account could create an administrator and sign in as one. The content rule grants editors
     * `create` and `update`, which is right for content and wrong here.
     */
    create: ({ req: { user } }) => isAdmin(principal(user)),
    update: ({ req: { user } }) => isAdmin(principal(user)),
    delete: ({ req: { user } }) => isAdmin(principal(user)),
    /**
     * Whether the panel's entry for the accounts appears at all, rather than what may be read once
     * it is. Administrators only, because an account list is a list of who may sign in.
     */
    admin: ({ req: { user } }) => isAdmin(principal(user)),
  },
  hooks: {
    beforeChange: [
      /**
       * The first account is an administrator, because there is nobody else to make one.
       *
       * The role field's default is `Editor`, which is the right default for every account after
       * the first: an administrator who accepts the prefilled form should not hand out
       * administrators by accident. The first account is the exception, and it is made here rather
       * than by a default that would apply to all of them.
       */
      async ({ collection, data, operation, req }) => {
        if (operation !== "create") return data;

        const { totalDocs } = await req.payload.count({
          collection: collection.slug,
          overrideAccess: true,
        });
        if (totalDocs > 0) return data;

        return { ...data, role: "admin" };
      },
    ],
  },
  fields: [
    {
      name: "role",
      type: "select",
      required: true,
      index: true,
      defaultValue: "editor",
      options: [
        { label: "Administrator", value: "admin" },
        { label: "Editor", value: "editor" },
      ],
    },
  ],
};

/**
 * The content Payload owns, with the editor, drafts and versions a CMS is for.
 *
 * `richText` is lexical and `versions.drafts` is on, which is the argument for handing content
 * editing to Payload rather than adding fields to an admin engine: the editor, the draft, the
 * version history and the diff are Payload's.
 */
export const Pages: CollectionConfig = {
  slug: "pages",
  admin: {
    useAsTitle: "title",
    group: "Content",
    description: "Content edited in Payload. No Helmdeck field types are involved.",
  },
  versions: {
    drafts: true,
  },
  access: {
    create: payloadAccess("create"),
    read: payloadAccess("read"),
    update: payloadAccess("update"),
    delete: payloadAccess("delete"),
    readVersions: payloadAccess("read"),
  },
  fields: [
    { name: "title", type: "text", required: true },
    { name: "slug", type: "text", required: true, unique: true, index: true },
    { name: "summary", type: "textarea", required: false },
    { name: "richText", type: "richText", required: true },
  ],
};

export const payloadCollections = [Users, Pages];

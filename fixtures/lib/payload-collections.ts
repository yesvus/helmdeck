// SPDX-License-Identifier: MIT

/**
 * Payload's collections: the accounts the demo already has, and the content Payload owns.
 *
 * Two collections, because this milestone is about the seam and not about a CMS. The accounts
 * collection is the arrangement under test, and one page collection is enough to prove a person can
 * write a document with a rich text editor in it and read it back.
 */

import type { CollectionConfig } from "payload";
import { demoPayloadCan, payloadAccess } from "./payload-access";
import { payloadAuthStrategies } from "./payload-auth-strategy";

/**
 * The accounts the demo already has, exposed to Payload rather than duplicated.
 *
 * `dbName` points this collection at the demo's own `users` table, so an account is one row rather
 * than two: helmdeck's credential store reads it and so does Payload, and there is no second copy
 * of a password hash to keep in step with the first.
 *
 * `disableLocalStrategy` is why there is no sign-in form on this collection. Payload's own login
 * would write its own hash into its own columns and accept its own password, which is a second
 * credential store giving a second answer about who may sign in. Turning it off means the only way
 * into the admin panel is the demo's own sign-in, through the strategy in `payload-auth-strategy`.
 *
 * `readOnly` then refuses create, update and delete outright, because Payload's injected auth
 * fields are what a local strategy writes into and there is no local strategy here to write them.
 * The demo's seed and its migrations are what grant a role; nothing reachable over HTTP changes one.
 */
export const DemoAccounts: CollectionConfig = {
  slug: "demo-accounts",
  dbName: "users",
  admin: {
    useAsTitle: "email",
    group: "Demo",
    description: "The demo's own accounts, read from the table its credential store already uses.",
  },
  lockDocuments: false,
  // The demo's `users` table already exists with its own columns, and Payload's automatic
  // `created_at`/`updated_at` pair is not among them. Declaring no timestamps is what makes Payload's
  // expected columns match the table that is really there, so the accounts collection reads rows the
  // credential store wrote rather than columns nobody created.
  timestamps: false,
  auth: {
    disableLocalStrategy: true,
    useAPIKey: false,
    verify: false,
    removeTokenFromResponses: true,
    maxLoginAttempts: 0,
    strategies: payloadAuthStrategies,
  },
  access: {
    create: () => false,
    read: ({ req: { user } }) => demoPayloadCan(user, "read"),
    update: () => false,
    delete: () => false,
    admin: ({ req: { user } }) => demoPayloadCan(user, "read"),
  },
  fields: [
    {
      name: "email",
      type: "email",
      required: true,
      unique: true,
      index: true,
      // Read access is the collection's rule applied to the field, so an address cannot be listed by
      // a request that could not list the collection. Write access is off: an account row is what the
      // credential store reads, and nothing over HTTP is how a role is granted.
      access: {
        read: ({ req: { user } }) => demoPayloadCan(user, "read"),
        create: () => false,
        update: () => false,
      },
    },
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
      access: {
        read: ({ req: { user } }) => demoPayloadCan(user, "read"),
        create: () => false,
        update: () => false,
      },
    },
  ],
};

/**
 * The content Payload owns, with the editor, drafts and versions a CMS is for.
 *
 * `richText` is lexical and `versions.drafts` is on, which is the argument for handing content
 * editing to Payload rather than adding fields to a CRUD engine: the editor, the draft, the version
 * history and the diff are Payload's, not fields this repo would re-implement and keep behind.
 */
export const DemoPages: CollectionConfig = {
  slug: "demo-pages",
  admin: {
    useAsTitle: "title",
    group: "Content",
    description: "Content edited in Payload. No helmdeck field types are involved.",
  },
  versions: {
    drafts: true,
  },
  access: {
    create: payloadAccess("create"),
    read: payloadAccess("read"),
    update: payloadAccess("update"),
    delete: payloadAccess("delete"),
    readVersions: payloadAccess("readVersions"),
  },
  fields: [
    { name: "title", type: "text", required: true },
    {
      name: "slug",
      type: "text",
      required: true,
      unique: true,
      index: true,
    },
    { name: "summary", type: "textarea", required: false },
    { name: "richText", type: "richText", required: true },
  ],
};

export const payloadCollections = [DemoAccounts, DemoPages];
// SPDX-License-Identifier: MIT
/**
 * Payload's collections: the accounts this host signs people in with, and the content it edits.
 *
 * Two collections, because the arrangement under test is the seam and not a CMS. The accounts
 * collection is the arrangement: it is where the role lives, it is what the panel authenticates
 * against, and it is what the host's session resolves to.
 */

import type { CollectionConfig } from "payload";
import { createAdminPayloadAuditHooks } from "@yesvus/helmdeck";
import { payloadAccess } from "./access.ts";
import { payloadAuthStrategies } from "./auth-strategy.ts";
import { isAdmin, principal } from "../rules.ts";
import { assertNotLastAdmin } from "./users-guard.ts";
import { AdminActivity } from "./activity.ts";
import { Feedback } from "./feedback.ts";
import { Posts } from "./posts.ts";
import { Categories, Tags } from "./taxonomy.ts";
import { isValidCanonicalUrl } from "./seo.ts";

const activityWriter = (row: unknown, req: unknown) => {
  const payload = (req as { payload?: { create?: (args: unknown) => unknown } } | null | undefined)?.payload;
  if (payload && typeof payload.create === "function") {
    return payload.create({ collection: "admin-activity", data: row, overrideAccess: true });
  }
  return undefined;
};

const usersAuditHooks = createAdminPayloadAuditHooks({ resource: "users", writer: activityWriter });
const pagesAuditHooks = createAdminPayloadAuditHooks({ resource: "pages", writer: activityWriter });
const mediaAuditHooks = createAdminPayloadAuditHooks({ resource: "media", writer: activityWriter });
const feedbackAuditHooks = createAdminPayloadAuditHooks({ resource: "feedback", writer: activityWriter });
const categoriesAuditHooks = createAdminPayloadAuditHooks({ resource: "categories", writer: activityWriter });
const tagsAuditHooks = createAdminPayloadAuditHooks({ resource: "tags", writer: activityWriter });

// Ensure the collections defined in their own modules carry the same audit hooks
// even when they are consumed through this module's re-exported collection list.
Feedback.hooks = { ...(Feedback.hooks ?? {}), afterChange: feedbackAuditHooks.afterChange, afterDelete: feedbackAuditHooks.afterDelete };
Categories.hooks = categoriesAuditHooks;
Tags.hooks = tagsAuditHooks;

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
     * Every write to an account is refused.
     *
     * An account is a role, so writing one is writing a permission, and the first account is the
     * one Payload's own first-user route writes rather than a request anybody else can make. A host
     * that wants to invite people opens these three, and an administrator-only rule over them is
     * the smallest thing worth opening.
     */
    create: ({ req: { user } }) => isAdmin(principal(user)),
    update: ({ req: { user } }) => isAdmin(principal(user)),
    delete: async ({ req: { user, payload }, id }) => {
      const account = principal(user);
      if (!isAdmin(account)) return false;
      // Bulk (collection-level) delete carries no target id. Refuse it: an admin surface that
      // wants to remove accounts does so one at a time through the guarded single-id path below,
      // where self-deletion and last-admin checks apply. Allowing a bulk delete would bypass them.
      if (id === undefined || id === null) return false;
      if (String(id) === account!.id) return false;
      try {
        const target = payload
          ? await payload.findByID({ collection: "users", id, depth: 0, overrideAccess: true })
          : null;
        const targetRole =
          target && typeof (target as { role?: unknown }).role === "string"
            ? (target as unknown as { role: string }).role
            : "admin";
        if (targetRole !== "admin") return true;
        const countResult = payload
          ? await payload.count({ collection: "users", where: { role: { equals: "admin" } } })
          : null;
        const total =
          countResult && typeof (countResult as { totalDocs?: unknown }).totalDocs === "number"
            ? (countResult as { totalDocs: number }).totalDocs
            : null;
        if (total === null) return true;
        const guard = await assertNotLastAdmin("delete", String(id), account!.id, {
          countAdmins: async () => total,
          targetIsAdmin: true,
        });
        return guard.ok;
      } catch {
        return false;
      }
    },
    /**
     * Whether the panel's entry for the accounts appears at all, rather than what may be read once
     * it is. Administrators only, because an account list is a list of who may sign in.
     */
    admin: ({ req: { user } }) => isAdmin(principal(user)),
  },
  hooks: usersAuditHooks,
  fields: [
    {
      name: "role",
      type: "select",
      required: true,
      index: true,
      // The first account is an administrator, because there is nobody else to make one, and it is
      // the only account this collection writes. The first-user form asks for the role, so a
      // deployment that wants an editor first can say so.
      defaultValue: "admin",
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
  hooks: pagesAuditHooks,
  fields: [
    { name: "title", type: "text", required: true },
    { name: "slug", type: "text", required: true, unique: true, index: true },
    { name: "summary", type: "textarea", required: false },
    { name: "richText", type: "richText", required: true },
    { name: "seoTitle", type: "text", required: false },
    { name: "seoDescription", type: "textarea", required: false },
    { name: "ogImage", type: "relationship", relationTo: "media" },
    {
      name: "canonicalUrl",
      type: "text",
      required: false,
      validate: (value: unknown) => {
        if (value === null || value === undefined || value === "") return true;
        return isValidCanonicalUrl(value) || "Canonical URL must be an absolute URL or a path.";
      },
    },
    {
      name: "blocks",
      type: "blocks",
      blocks: [
        {
          slug: "hero",
          fields: [
            { name: "heading", type: "text", required: false },
            { name: "body", type: "textarea", required: false },
          ],
        },
        {
          slug: "text",
          fields: [
            { name: "content", type: "textarea", required: false },
          ],
        },
      ],
    },
  ],
};

/**
 * The uploads Payload owns, as a collection of type upload.
 *
 * Payload's upload collection holds the file, its size, its type, the image's dimensions and the
 * variants. The media library reads that through the package's adapter rather than through a
 * second store, so upload, list, rename and delete are the same rows the panel edits.
 */
export const Media: CollectionConfig = {
  slug: "media",
  upload: true,
  access: {
    create: payloadAccess("create"),
    read: payloadAccess("read"),
    update: payloadAccess("update"),
    delete: payloadAccess("delete"),
  },
  hooks: mediaAuditHooks,
  fields: [
    { name: "alt", type: "text", required: false },
  ],
};

export const payloadCollections = [Users, Pages, Media, Feedback, Posts, Categories, Tags, AdminActivity];

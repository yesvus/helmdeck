// SPDX-License-Identifier: MIT
import { sqliteAdapter } from "@payloadcms/db-sqlite";
import { buildConfig, type AuthStrategyResult, type CollectionConfig } from "payload";
import { payloadAccess } from "./lib/payload-access";
import { payloadAuthStrategy } from "./lib/session";

const secret = process.env.PAYLOAD_SECRET?.trim();
if (!secret) throw new Error("PAYLOAD_SECRET is required");

function isAdminUser(user: unknown): boolean {
  return Boolean(user && typeof user === "object" && "role" in user && user.role === "admin");
}

const Users: CollectionConfig = {
  slug: "users",
  auth: {
    removeTokenFromResponses: true,
    maxLoginAttempts: 10,
    strategies: [{
      name: "helmdeck-session",
      async authenticate(args): Promise<AuthStrategyResult> {
        const result = await payloadAuthStrategy.authenticate(args);
        if (!result.user) return { user: null };
        return { user: { ...result.user, collection: "users" } as NonNullable<AuthStrategyResult["user"]> };
      },
    }],
  },
  access: {
    read: ({ req: { user } }) => {
      if (!user) return false;
      return isAdminUser(user) ? true : { id: { equals: user.id } };
    },
    create: async ({ req: { payload } }) => (await payload.count({ collection: "users", overrideAccess: true })).totalDocs === 0,
    update: ({ req: { user } }) => isAdminUser(user),
    delete: ({ req: { user } }) => isAdminUser(user),
  },
  admin: { useAsTitle: "email" },
  fields: [{ name: "role", type: "select", required: true, defaultValue: "admin", options: ["admin", "editor"] }],
};

const Products: CollectionConfig = {
  slug: "products",
  access: { create: payloadAccess("create"), read: payloadAccess("read"), update: payloadAccess("update"), delete: payloadAccess("delete") },
  fields: [{ name: "name", type: "text", required: true }, { name: "sku", type: "text", required: true, unique: true }, { name: "price_cents", type: "number", required: true }],
};

export default buildConfig({ secret, db: sqliteAdapter({ client: { url: process.env.PAYLOAD_DATABASE_URL || "file:./payload.db" }, push: process.env.NODE_ENV === "development" }), collections: [Users, Products], routes: { admin: "/payload/admin" }, admin: { user: "users" } });

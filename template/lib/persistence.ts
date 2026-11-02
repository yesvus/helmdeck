import { createAdminPayloadContent, createAdminPayloadPersistenceAdapter } from "@yesvus/helmdeck";
import type { AdminPersistenceAdapter } from "@yesvus/helmdeck";
import { getPayload } from "payload";
import config from "../payload.config";
import { readPayloadSession } from "./session";

export async function payloadPersistence(): Promise<AdminPersistenceAdapter> {
  const payload = await getPayload({ config });
  const content = createAdminPayloadContent({ payload, resolveUser: readPayloadSession });
  return createAdminPayloadPersistenceAdapter({ content, collection: "products", searchFields: ["name", "sku"] });
}

import "server-only";
import { normalizeExampleContentBlocks } from "./block-definition";
import { persistence } from "@/host/persistence";

export async function readContentBlocks() {
  const record = await persistence.read<{ blocks?: unknown }>("content-blocks", "landing");
  return normalizeExampleContentBlocks(record?.blocks);
}

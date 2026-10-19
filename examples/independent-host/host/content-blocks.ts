import "server-only";
import { normalizeExampleContentBlocks } from "./block-definition";
import { persistence } from "@/host/persistence";

export async function readContentBlocks() {
  return normalizeExampleContentBlocks(await persistence.read<unknown>("content-blocks", "landing"));
}

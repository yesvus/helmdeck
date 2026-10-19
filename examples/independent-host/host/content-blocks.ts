import "server-only";
import type { ExampleContentBlockEntry } from "@/host/block-definition";
import { persistence } from "@/host/persistence";

export async function readContentBlocks() {
  return (await persistence.read<ExampleContentBlockEntry[]>("content-blocks", "landing")) ?? [];
}

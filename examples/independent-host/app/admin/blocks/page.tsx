import { ContentBlockEditor } from "@/components/content-block-editor";
import { readContentBlocks } from "@/host/content-blocks";

export default async function ContentBlocksPage() {
  const blocks = await readContentBlocks();
  return <ContentBlockEditor initial={blocks} />;
}

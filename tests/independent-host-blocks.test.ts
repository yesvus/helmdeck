import { describe, expect, it } from "vitest";
import {
  adminCollectionAdd,
  adminCollectionFormData,
  adminCollectionMove,
  adminCollectionValidate,
  adminCollectionValues,
} from "../src/collections/registry";
import { createExampleBlock, exampleBlockDefinition, isValidExampleBlockId, resolveExampleBlockHeading, type ExampleContentBlock } from "../examples/independent-host/host/block-definition";

describe("independent host content blocks", () => {
  it("keeps typed block identities through reorder and serialization", () => {
    const hero = adminCollectionAdd<ExampleContentBlock>([], {
      ...createExampleBlock("hero"),
      heading: "A useful workspace",
      headingByLocale: { en: "A useful workspace", tr: "Kullanışlı bir çalışma alanı" },
      copy: "A typed hero block.",
    })[0];
    const quoteBlock: ExampleContentBlock = {
      kind: "quote",
      heading: "Customer story",
      headingByLocale: { en: "", tr: "" },
      copy: "The new setup feels right.",
      attribution: "Alex Morgan",
    };
    const quote = adminCollectionAdd<ExampleContentBlock>([hero], quoteBlock)[1];
    const reordered = adminCollectionMove([hero, quote], 0, 1);
    const restored = adminCollectionValues(exampleBlockDefinition, adminCollectionFormData(exampleBlockDefinition, reordered));

    expect(restored).toEqual([quote, hero]);
    expect(new Set(restored.map((entry) => entry.id)).size).toBe(2);
  });

  it("validates fields declared by each host block", () => {
    const invalidQuote = adminCollectionAdd([], createExampleBlock("quote"));

    expect(adminCollectionValidate(exampleBlockDefinition, invalidQuote)).toEqual([
      { index: 0, id: invalidQuote[0].id, field: "heading", message: "A heading is required." },
      { index: 0, id: invalidQuote[0].id, field: "attribution", message: "An attribution is required for quotes." },
    ]);
  });

  it("rejects malformed persisted fields and non-web image URLs", () => {
    const malformed = adminCollectionAdd<ExampleContentBlock>([], {
      ...createExampleBlock("hero"),
      headingByLocale: { en: "Valid", tr: "Valid" },
      imageUrl: "javascript:alert(1)",
      copy: { unexpected: "object" },
    } as unknown as ExampleContentBlock);

    expect(adminCollectionValidate(exampleBlockDefinition, malformed).map(({ field }) => field)).toEqual(["heading", "copy", "imageUrl"]);
  });

  it("accepts only bounded identifier characters for block IDs", () => {
    expect(isValidExampleBlockId("block_hero-1")).toBe(true);
    expect(isValidExampleBlockId(`block_${"a".repeat(100)}`)).toBe(false);
    expect(isValidExampleBlockId("<script>alert(1)</script>")).toBe(false);
  });

  it("resolves localized headings with a generic fallback", () => {
    const block = {
      ...createExampleBlock("hero"),
      heading: "Generic heading",
      headingByLocale: { en: "English heading", tr: "Türkçe başlık" },
    };

    expect(resolveExampleBlockHeading(block, "en")).toBe("English heading");
    expect(resolveExampleBlockHeading(block, "tr")).toBe("Türkçe başlık");
    expect(resolveExampleBlockHeading({ ...block, headingByLocale: { en: "", tr: "" } }, "en")).toBe("Generic heading");
  });
});

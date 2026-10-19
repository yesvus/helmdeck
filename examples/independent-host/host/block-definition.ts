import {
  type AdminCollectionDefinition,
  type AdminCollectionEntry,
} from "@yesvus/helmdeck";

export type ExampleBlockKind = "hero" | "quote";

type ExampleBlockFields = {
  heading: string;
  headingByLocale: { en: string; tr: string };
  copy: string;
};

export type ExampleContentBlock = ExampleBlockFields & (
  | { kind: "hero"; imageUrl: string; imageAlt: string }
  | { kind: "quote"; attribution: string }
);

export type ExampleContentBlockEntry = AdminCollectionEntry<ExampleContentBlock>;

export function isValidExampleBlockId(id: string) {
  return /^[A-Za-z0-9_-]{1,100}$/.test(id);
}

export function resolveExampleBlockHeading(block: ExampleContentBlock, locale: "en" | "tr") {
  return block.headingByLocale[locale] || block.heading;
}

export function getExampleBlockLocale(locale: string): "en" | "tr" {
  return locale.toLowerCase().split("-")[0] === "tr" ? "tr" : "en";
}

export const blockKinds: Record<ExampleBlockKind, { label: string }> = {
  hero: { label: "Hero" },
  quote: { label: "Quote" },
};

export function createExampleBlock(kind: ExampleBlockKind): ExampleContentBlock {
  const fields: ExampleBlockFields = {
    heading: "",
    headingByLocale: { en: "", tr: "" },
    copy: "",
  };
  return kind === "hero"
    ? { ...fields, kind, imageUrl: "", imageAlt: "" }
    : { ...fields, kind, attribution: "" };
}

export const exampleBlockDefinition: AdminCollectionDefinition<ExampleContentBlock> = {
  name: "contentBlocks",
  fields: [
    { name: "kind" },
    { name: "heading", label: "Heading" },
    { name: "headingByLocale" },
    { name: "copy", label: "Copy" },
    { name: "imageUrl", label: "Image" },
    { name: "imageAlt", label: "Image description" },
    { name: "attribution", label: "Attribution" },
  ],
  create: () => createExampleBlock("hero"),
  validate: (entry) => {
    const problems = [];
    const value = entry as Record<string, unknown>;
    const isText = (candidate: unknown): candidate is string => typeof candidate === "string" && candidate.length <= 10_000;
    if (!isText(value.heading) || !value.heading.trim()) {
      problems.push({ field: "heading", message: "A heading is required." });
    }
    if (!isText(value.copy)) {
      problems.push({ field: "copy", message: "Copy must be text under 10,000 characters." });
    }
    const localized = value.headingByLocale;
    if (!localized || typeof localized !== "object" || Array.isArray(localized)
      || !isText((localized as Record<string, unknown>).en)
      || !isText((localized as Record<string, unknown>).tr)) {
      problems.push({ field: "headingByLocale", message: "English and Turkish headings must be text under 10,000 characters." });
    }
    if (entry.kind === "hero") {
      if (!isText(value.imageAlt) || (isText(value.imageUrl) && Boolean(value.imageUrl) && !value.imageAlt.trim())) {
        problems.push({ field: "imageAlt", message: "Image description must be text under 10,000 characters." });
      }
      if (!isText(value.imageUrl)) {
        problems.push({ field: "imageUrl", message: "Image URL must be text under 10,000 characters." });
      } else if (value.imageUrl) {
        try {
          const url = new URL(value.imageUrl);
          if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error();
        } catch {
          problems.push({ field: "imageUrl", message: "Image URL must use HTTP or HTTPS." });
        }
      }
    }
    if (entry.kind === "quote" && (!isText(value.attribution) || !value.attribution.trim())) {
      problems.push({ field: "attribution", message: "An attribution is required for quotes." });
    }
    if (entry.kind !== "hero" && entry.kind !== "quote") {
      problems.push({ field: "kind", message: "Choose a supported block type." });
    }
    return problems;
  },
};

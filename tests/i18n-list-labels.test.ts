// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import {
  englishAdminMessages,
  turkishAdminMessages,
  type AdminMessages,
} from "../src/i18n/messages";
import { defaultAdminResourceListQueryLabels } from "../src/resources/list-labels";

/**
 * Every locale carries every string, and carries it in its own language.
 *
 * The type already requires the section, so a locale missing a key does not compile. What it cannot
 * require is that the string is *translated*: a Turkish dictionary that answers with the English text
 * type-checks perfectly and reads as though localisation is broken, which is worse than a key that is
 * obviously absent. So the two halves are checked separately: the type covers the shape, and this
 * covers the translation.
 *
 * This section is new. The list's search, sort, filter and count strings were added as English
 * defaults on the list's own `labels` prop, which overrides them the way a host overrides anything
 * else. The problem is that a host's dictionary had no keys to point them at, so the one locale the
 * package ships could not reach them.
 */
const LOCALES: { name: string; messages: AdminMessages }[] = [
  { name: "en", messages: englishAdminMessages },
  { name: "tr", messages: turkishAdminMessages },
];

describe("the list's query strings", () => {
  it("gives every locale every key, which the type requires and this confirms", () => {
    for (const { name, messages } of LOCALES) {
      const missing = Object.keys(defaultAdminResourceListQueryLabels).filter(
        (key) => (messages.resourceList as Record<string, unknown>)[key] === undefined,
      );
      expect(missing, `${name} is missing a list label`).toEqual([]);
    }
  });

  it("translates every string rather than leaving the English in place", () => {
    const turkish = turkishAdminMessages.resourceList;
    // The English values, gathered by running the defaults rather than by writing them out here, so
    // this cannot itself become a third copy that drifts.
    const english = defaultAdminResourceListQueryLabels;

    const untranslated = Object.entries(english)
      .filter(([, value]) => typeof value === "string")
      .filter(([key, value]) => (turkish as unknown as Record<string, string>)[key] === value)
      .map(([key]) => key);
    expect(untranslated, "a Turkish label that is still the English string").toEqual([]);
  });

  it("keeps the count's placeholders, because a translated count that drops the numbers is worse", () => {
    // A count is the one label that takes arguments, so it is the one a translation can quietly
    // break: `Showing 1 to 40 of 4003` becoming a sentence with no numbers in it still compiles.
    const shown = turkishAdminMessages.resourceList.resultCount(1, 40, 4003);
    expect(shown).toContain("1");
    expect(shown).toContain("40");
    expect(shown).toContain("4003");
  });

  it("reads the English defaults from the list's own defaults, so the two cannot diverge", () => {
    // The dictionary takes the same object the list falls back to. If a host has no dictionary at
    // all, the list's defaults are what a person sees, and they must be the same strings.
    expect(englishAdminMessages.resourceList).toBe(defaultAdminResourceListQueryLabels);
  });
});

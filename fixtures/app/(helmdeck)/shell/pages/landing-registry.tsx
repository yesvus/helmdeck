// SPDX-License-Identifier: MIT
import {
  adminDashboardCollection,
  createAdminWidgetRegistry,
  defineAdminWidget,
  type AdminCollectionDefinition,
  type AdminCollectionEntry,
  type AdminDashboardPlacementValue,
} from "@yesvus/helmdeck";

/**
 * The sections a landing page is built from, declared once for the editor, the preview and the store.
 *
 * The engine refuses to invent element shape, so what a section is comes from here rather than from
 * the editor: `create` returns an unplaced section, and validation is the registry's, which is why
 * picking a section the arrangement cannot render is reported on that entry instead of saved quietly.
 *
 * `title` is the host's own field and the engine knows nothing about it. It is declared here rather
 * than on the editor's props because the three that have to agree about it are the editor, the
 * preview and the server action that persists it, and three declarations of one section is two
 * chances for them to disagree.
 */

export type LandingSectionValue = AdminDashboardPlacementValue & {
  /** The heading a person wrote, stored in its own column rather than in the section's document. */
  title: string;
};

export type LandingSection = AdminCollectionEntry<LandingSectionValue>;

export type LandingSectionData = { heading: string; copy: string };

export const landingWidgets = createAdminWidgetRegistry({
  hero: defineAdminWidget<LandingSectionData>({
    id: "hero",
    title: "Hero",
    description: "The first thing on the page.",
    sizes: ["xl"],
    render: (data) => (
      <div className="space-y-2">
        <p className="text-2xl font-semibold text-zinc-900">{data.heading}</p>
        <p className="text-sm text-zinc-600">{data.copy}</p>
      </div>
    ),
  }),
  features: defineAdminWidget<LandingSectionData>({
    id: "features",
    title: "Feature grid",
    sizes: ["lg", "xl"],
    render: (data) => (
      <div className="space-y-1">
        <p className="text-base font-semibold text-zinc-900">{data.heading}</p>
        <p className="text-sm text-zinc-600">{data.copy}</p>
      </div>
    ),
  }),
  pricing: defineAdminWidget<LandingSectionData>({
    id: "pricing",
    title: "Pricing table",
    sizes: ["md", "lg", "xl"],
    render: (data) => (
      <div className="space-y-1">
        <p className="text-base font-semibold text-zinc-900">{data.heading}</p>
        <p className="text-sm text-zinc-600">{data.copy}</p>
      </div>
    ),
  }),
  testimonials: defineAdminWidget<LandingSectionData>({
    id: "testimonials",
    title: "Testimonials",
    sizes: ["md", "lg"],
    render: (data) => (
      <div className="space-y-1">
        <p className="text-base font-semibold text-zinc-900">{data.heading}</p>
        <p className="text-sm text-zinc-600">{data.copy}</p>
      </div>
    ),
  }),
  faq: defineAdminWidget<LandingSectionData>({
    id: "faq",
    title: "FAQ",
    sizes: ["sm", "md", "lg", "xl"],
    render: (data) => (
      <div className="space-y-1">
        <p className="text-base font-semibold text-zinc-900">{data.heading}</p>
        <p className="text-sm text-zinc-600">{data.copy}</p>
      </div>
    ),
  }),
});

const placements = adminDashboardCollection(landingWidgets);

/**
 * The editor's definition for a landing section: the engine's placement, plus the host's heading.
 *
 * `validate` is the engine's own function rather than a rule written here. A section that names a
 * widget the registry does not have, or a width that widget does not render at, is the engine's
 * problem to describe, and a host copy of that rule is a second answer to the same question.
 */
export const landingSections: AdminCollectionDefinition<LandingSectionValue> = {
  name: "sections",
  fields: [{ name: "widget" }, { name: "size" }, { name: "title" }],
  create: () => ({ widget: "", size: "sm", title: "" }),
  validate: (entry) => placements.validate(entry),
};

/** The fixed sample body the preview renders under the heading a person wrote. */
const sectionCopy: Record<string, string> = {
  hero: "Northstar Supply, delivering across the EU",
  features: "Choose a room, pick a finish, and we will build it there.",
  pricing: "Delivery and assembly are included in every price.",
  testimonials: "Rated 4.8 out of 5 by 2,100 homes.",
  faq: "If it does not fit the room, we will collect it and refund it.",
};

export function landingSectionCopy(kind: string): string {
  return sectionCopy[kind] ?? "A section this build does not provide";
}

/** What a section is called before anyone renames it, which is the registry's own name for it. */
export function landingSectionName(kind: string): string {
  return landingWidgets.resolve(kind)?.title ?? kind;
}

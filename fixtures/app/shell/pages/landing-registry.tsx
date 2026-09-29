// SPDX-License-Identifier: MIT
import {
  adminDashboardCollection,
  createAdminWidgetRegistry,
  defineAdminWidget,
  type AdminCollectionDefinition,
  type AdminDashboardPlacementValue,
} from "@yesvus/helmdeck";

/**
 * The sections a landing page is built from, declared once for the editor and the preview.
 *
 * The engine refuses to invent element shape, so what a section is comes from here rather than from
 * the editor: `create` returns an unplaced section, and validation is the registry's, which is why
 * picking a section the arrangement cannot render is reported on that entry instead of saved quietly.
 */

export type LandingSectionData = { copy: string };

export const landingWidgets = createAdminWidgetRegistry({
  hero: defineAdminWidget<LandingSectionData>({
    id: "hero",
    title: "Hero",
    description: "The first thing on the page.",
    sizes: ["xl"],
    render: (data) => <p className="text-2xl font-semibold text-zinc-900">{data.copy}</p>,
  }),
  features: defineAdminWidget<LandingSectionData>({
    id: "features",
    title: "Feature grid",
    sizes: ["lg", "xl"],
    render: (data) => <p className="text-sm text-zinc-600">{data.copy}</p>,
  }),
  pricing: defineAdminWidget<LandingSectionData>({
    id: "pricing",
    title: "Pricing table",
    sizes: ["md", "lg", "xl"],
    render: (data) => <p className="text-sm text-zinc-600">{data.copy}</p>,
  }),
  testimonials: defineAdminWidget<LandingSectionData>({
    id: "testimonials",
    title: "Testimonials",
    sizes: ["md", "lg"],
    render: (data) => <p className="text-sm text-zinc-600">{data.copy}</p>,
  }),
  faq: defineAdminWidget<LandingSectionData>({
    id: "faq",
    title: "FAQ",
    sizes: ["sm", "md", "lg", "xl"],
    render: (data) => <p className="text-sm text-zinc-600">{data.copy}</p>,
  }),
});

export const landingSections: AdminCollectionDefinition<AdminDashboardPlacementValue> =
  adminDashboardCollection(landingWidgets);

const sectionCopy: Record<string, string> = {
  hero: "Furniture that arrives before you have finished choosing it",
  features: "Flat-pack delivery, assembled in the room it will live in",
  pricing: "Everything under 900, no delivery surcharge",
  testimonials: "Rated 4.8 by 2,100 homes",
  faq: "Returns for 60 days, no questions",
};

/** The fixed sample text the preview renders, so the arrangement is legible without a data source. */
export function landingSectionCopy(widget: string): string {
  return sectionCopy[widget] ?? "A section this build does not provide";
}

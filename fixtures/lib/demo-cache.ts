// SPDX-License-Identifier: MIT

/**
 * The demo's cache, over the same invalidation call the package's seam makes.
 *
 * The mapping is deliberately partial and the gaps are named. `products` and `orders` are list
 * routes of their own, `posts` is the CMS content page, and `site_settings` is read by the shell on
 * every route, so a write to any of them changes something a visitor can see. `landing_sections`
 * and `dashboard_placements` drive pages with no route named after the resource, and a resource
 * nobody routes on has nothing to revalidate.
 *
 * A host's own mapping is the same shape and none of this is the package's business: what the package
 * supplies is the *call*, and the fact that a create invalidates the collection while an update and a
 * delete invalidate the record. Getting that split wrong is how a cache serves a row that was deleted
 * three requests ago.
 */
const RESOURCE_ROUTES: Readonly<Record<string, readonly string[]>> = {
  products: ["/shell/products"],
  orders: ["/shell/orders"],
  posts: ["/shell/content", "/shell/revisions"],
  // The shell reads the stored accent on every route, so a change to it is visible everywhere and not
  // only on the settings page. Naming the settings page alone would leave the shell serving a colour
  // the person just changed until something else revalidated.
  site_settings: ["/shell/settings/site", "/shell"],
  landing_sections: ["/shell/pages"],
  dashboard_placements: ["/dashboard", "/dashboard/arrange"],
};

export function demoCacheRoutes(resource: string, resourceId?: string): string[] {
  const routes = RESOURCE_ROUTES[resource];
  if (routes === undefined) return [];
  if (resourceId === undefined) return [...routes];
  return [...routes, ...routes.map((route) => `${route}/${resourceId}`)];
}

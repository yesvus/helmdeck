// SPDX-License-Identifier: MIT

import { revalidatePath } from "next/cache";
import { principal, isAdmin } from "./rules";
import { AdminPayloadAccessRefused } from "@yesvus/helmdeck";
import {
  NAVIGATION_GLOBAL,
  normaliseNavigationItems,
  normaliseNavigationItem,
  validateNavigationItems,
  validateNavigationItem,
  validateNavigationMenu,
  urlIsValid,
  type NavigationMenuItem,
  type PayloadNavigationProblem,
} from "./payload/menu";

export type ActionResult = { ok: true; problems?: PayloadNavigationProblem[] } | { ok: false; error: string; problems?: PayloadNavigationProblem[] };

export type { NavigationMenuItem } from "./payload/menu";

export type NavigationTerm = { id: string; label: string; slug: string };

type SessionLike = { id?: string | number; email?: string; role?: unknown } | null;

export type NavigationActionsDependencies = {
  sessionResolver?: () => Promise<SessionLike>;
  readSession?: () => Promise<SessionLike>;
  resolveUser?: () => Promise<SessionLike>;
  store?: {
    get: (slug: string) => Promise<unknown>;
    set: (slug: string, data: Record<string, unknown>) => Promise<unknown>;
  };
  globalStore?: {
    get: (slug: string) => Promise<unknown>;
    set: (slug: string, data: Record<string, unknown>) => Promise<unknown>;
  };
  payload?: {
    findGlobal?: (args: { slug: string; [key: string]: unknown }) => Promise<unknown>;
    updateGlobal?: (args: { slug: string; data: unknown; [key: string]: unknown }) => Promise<unknown>;
    find?: (args: { collection: string; [key: string]: unknown }) => Promise<unknown>;
    findByID?: (args: { collection: string; id: string | number; [key: string]: unknown }) => Promise<unknown>;
    create?: (args: { collection: string; data: unknown; [key: string]: unknown }) => Promise<unknown>;
    update?: (args: { collection: string; id: string | number; data: unknown; [key: string]: unknown }) => Promise<unknown>;
    delete?: (args: { collection: string; id: string | number; [key: string]: unknown }) => Promise<unknown>;
  };
  bridge?: {
    findGlobal?: (slug: string, args?: Record<string, unknown>) => Promise<unknown>;
    updateGlobal?: (slug: string, data: unknown, args?: Record<string, unknown>) => Promise<unknown>;
  };
  listPages?: () => Promise<Array<{ id?: string | number; slug?: string; title?: string }>>;
  countAdmins?: () => Promise<number> | number;
};

function getSessionResolver(deps: NavigationActionsDependencies): () => Promise<SessionLike> {
  return deps.sessionResolver ?? deps.readSession ?? deps.resolveUser ?? (async () => null);
}

function getStore(deps: NavigationActionsDependencies) {
  return deps.store ?? deps.globalStore ?? null;
}

async function readGlobal(deps: NavigationActionsDependencies, user: SessionLike): Promise<unknown> {
  if (!user) throw new AdminPayloadAccessRefused("findGlobal");
  const store = getStore(deps);
  if (store) return store.get(NAVIGATION_GLOBAL);
  if (deps.bridge?.findGlobal) return deps.bridge.findGlobal(NAVIGATION_GLOBAL, { depth: 0 });
  if (deps.payload?.findGlobal) return deps.payload.findGlobal({ slug: NAVIGATION_GLOBAL, depth: 0, overrideAccess: false, user: user as never });
  return null;
}

async function writeGlobal(deps: NavigationActionsDependencies, user: SessionLike, data: Record<string, unknown>): Promise<unknown> {
  const store = getStore(deps);
  if (store) return store.set(NAVIGATION_GLOBAL, data);
  if (deps.bridge?.updateGlobal) return deps.bridge.updateGlobal(NAVIGATION_GLOBAL, data, { depth: 0 });
  if (deps.payload?.updateGlobal) return deps.payload.updateGlobal({ slug: NAVIGATION_GLOBAL, data, depth: 0, overrideAccess: false, user: user as never });
  return null;
}

function readItems(doc: unknown): NavigationMenuItem[] {
  if (Array.isArray(doc)) return normaliseNavigationItems(doc);
  if (doc && typeof doc === "object") {
    const items = (doc as { items?: unknown }).items;
    if (Array.isArray(items)) return normaliseNavigationItems(items);
  }
  return [];
}

export function createNavigationActions(deps: NavigationActionsDependencies = {}) {
  const sessionResolver = getSessionResolver(deps);

  async function currentAdmin(): Promise<SessionLike> {
    const session = await sessionResolver();
    const user = principal(session);
    if (!isAdmin(user)) return null;
    return session;
  }

  async function currentSession(): Promise<SessionLike> {
    return sessionResolver();
  }

  async function listNavigationItems(): Promise<NavigationMenuItem[]> {
    const user = await currentSession();
    const doc = await readGlobal(deps, user);
    return readItems(doc).sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async function listPagesForPicker(): Promise<Array<{ id: string; slug: string; title: string }>> {
    if (deps.listPages) {
      const pages = await deps.listPages();
      return pages.map((page) => ({ id: String(page.id ?? page.slug ?? ""), slug: String(page.slug ?? ""), title: String(page.title ?? page.slug ?? "") }));
    }
    const user = await currentSession();
    const payload = deps.payload;
    if (!payload?.find) return [];
    const result = await payload.find({ collection: "pages", overrideAccess: false, user: user as never, limit: 100, depth: 0, draft: true });
    const docs = Array.isArray((result as { docs?: unknown })?.docs) ? ((result as { docs: unknown[] }).docs) : [];
    return docs.map((doc) => {
      const row = (doc ?? {}) as Record<string, unknown>;
      return { id: String(row.id ?? row.slug ?? ""), slug: String(row.slug ?? ""), title: String(row.title ?? row.slug ?? "") };
    });
  }

  async function saveNavigationMenu(items: unknown, pageSlugs: string[] = []): Promise<ActionResult> {
    try {
      const admin = await currentAdmin();
      if (!admin) return { ok: false, error: "Not authorized" };
      const payload = deps.payload;
      if (!deps.store && !deps.globalStore && !deps.bridge && !payload?.updateGlobal) {
        // still allow store-less? no.
      }
      const normalised = normaliseNavigationItems(items);
      const problems = validateNavigationItems(normalised, pageSlugs);
      if (problems.length > 0) return { ok: false, error: problems.map((p) => `${p.field ?? "item"}: ${p.message}`).join("; "), problems };
      const written = await writeGlobal(deps, admin, { items: normalised.map((item, index) => ({ ...item, sortOrder: index })) });
      void written;
      try { revalidatePath("/", "layout"); } catch { void 0; }
      try { revalidatePath("/admin/navigation"); } catch { void 0; }
      return { ok: true, problems: [] };
    } catch {
      return { ok: false, error: "Could not save navigation menu" };
    }
  }

  async function saveNavigationItems(items: unknown, pageSlugs?: string[]): Promise<ActionResult> {
    return saveNavigationMenu(items, pageSlugs);
  }

  async function addNavigationItem(item: unknown, pageSlugs: string[] = []): Promise<ActionResult> {
    const current = await listNavigationItems();
    const problems = validateNavigationItem(item, pageSlugs);
    if (problems.length > 0) return { ok: false, error: problems.map((p) => `${p.field}: ${p.message}`).join("; "), problems };
    const next = [...current, normaliseNavigationItem(item)];
    return saveNavigationMenu(next, pageSlugs);
  }

  async function updateNavigationItem(id: string, patch: unknown, pageSlugs: string[] = []): Promise<ActionResult> {
    const current = await listNavigationItems();
    const index = current.findIndex((item) => String((item as { id?: string }).id) === String(id));
    if (index < 0) return { ok: false, error: "Not found" };
    const merged = normaliseNavigationItem({ ...current[index], ...(patch as object), id });
    const problems = validateNavigationItem(merged, pageSlugs);
    if (problems.length > 0) return { ok: false, error: problems.map((p) => `${p.field}: ${p.message}`).join("; "), problems };
    const next = current.map((item, i) => (i === index ? merged : item));
    return saveNavigationMenu(next, pageSlugs);
  }

  async function deleteNavigationItem(id: string): Promise<ActionResult> {
    try {
      const admin = await currentAdmin();
      if (!admin) return { ok: false, error: "Not authorized" };
      const current = await listNavigationItems();
      const next = current.filter((item) => String((item as { id?: string }).id) !== String(id));
      return saveNavigationMenu(next);
    } catch {
      return { ok: false, error: "Could not delete navigation item" };
    }
  }

  // Taxonomy helpers.
  async function listTerms(collection: string): Promise<NavigationTerm[]> {
    const user = await currentSession();
    const payload = deps.payload;
    if (!payload?.find) return [];
    const result = await payload.find({ collection, overrideAccess: false, user: user as never, limit: 100, depth: 0 });
    const docs = Array.isArray((result as { docs?: unknown })?.docs) ? ((result as { docs: unknown[] }).docs) : [];
    return docs.map((doc) => {
      const row = (doc ?? {}) as Record<string, unknown>;
      return { id: String(row.id ?? ""), label: String(row.label ?? row.title ?? ""), slug: String(row.slug ?? "") };
    });
  }

  async function createTerm(collection: string, label: string, slug: string): Promise<ActionResult> {
    try {
      const admin = await currentAdmin();
      if (!admin) return { ok: false, error: "Not authorized" };
      const payload = deps.payload;
      if (!payload?.create) return { ok: false, error: "Not available" };
      if (!label?.trim()) return { ok: false, error: "Label is required" };
      if (!slug?.trim()) return { ok: false, error: "Slug is required" };
      await payload.create({ collection, data: { label: label.trim(), slug: slug.trim() }, overrideAccess: false, user: admin as never });
      try { revalidatePath("/admin/taxonomy"); } catch { void 0; }
      return { ok: true };
    } catch {
      return { ok: false, error: "Could not create term" };
    }
  }

  async function renameTerm(collection: string, id: string, label: string): Promise<ActionResult> {
    try {
      const admin = await currentAdmin();
      if (!admin) return { ok: false, error: "Not authorized" };
      const payload = deps.payload;
      if (!payload?.update) return { ok: false, error: "Not available" };
      if (!id) return { ok: false, error: "Invalid request" };
      if (!label?.trim()) return { ok: false, error: "Label is required" };
      await payload.update({ collection, id, data: { label: label.trim() }, overrideAccess: false, user: admin as never });
      try { revalidatePath("/admin/taxonomy"); } catch { void 0; }
      return { ok: true };
    } catch {
      return { ok: false, error: "Could not rename term" };
    }
  }

  async function deleteTerm(collection: string, id: string): Promise<ActionResult> {
    try {
      const admin = await currentAdmin();
      if (!admin) return { ok: false, error: "Not authorized" };
      const payload = deps.payload;
      if (!payload?.delete) return { ok: false, error: "Not available" };
      if (!id) return { ok: false, error: "Invalid request" };
      await payload.delete({ collection, id, overrideAccess: false, user: admin as never });
      try { revalidatePath("/admin/taxonomy"); } catch { void 0; }
      return { ok: true };
    } catch {
      return { ok: false, error: "Could not delete term" };
    }
  }

  return {
    listNavigationItems,
    getNavigationMenu: listNavigationItems,
    listNavigation: listNavigationItems,
    saveNavigationMenu,
    saveNavigationItems,
    saveNavigation: saveNavigationMenu,
    addNavigationItem,
    addNavItem: addNavigationItem,
    updateNavigationItem,
    updateNavItem: updateNavigationItem,
    deleteNavigationItem,
    deleteNavItem: deleteNavigationItem,
    listPages: listPagesForPicker,
    listPagesForPicker,
    listTerms,
    createTerm,
    renameTerm,
    deleteTerm,
    validateNavigationItem,
    validateNavigationItems,
    validateNavigationMenu,
    urlIsValid,
    normaliseNavigationItems,
    normaliseNavigationItem,
  };
}

export const createNavActions = createNavigationActions;

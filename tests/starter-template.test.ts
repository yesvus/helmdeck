// SPDX-License-Identifier: MIT
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { typecheckTemplate } from "../scripts/typecheck-template.mjs";

/**
 * The starter template, and the properties that make it a template rather than an example.
 *
 * An example is something a person reads. A template is something a person copies, and a copied
 * artifact is only as good as the claims made about it, so each property here is a claim the README
 * or the code makes, and this file falsifies it. The claims that cannot be checked by reading are
 * checked by running something: the compiler, and a module that refuses to load without a secret.
 */

const root = resolve(import.meta.dirname, "..");
const template = join(root, "template");
const templateReadme = readFileSync(join(template, "README.md"), "utf8");

/** Every source file the package can be copied from, in a stable order. */
function templateSources(directory = template): string[] {
  return readdirSync(directory)
    .flatMap((entry) => {
      if (entry === "node_modules" || entry === ".next" || entry === "dist") return [];
      const path = join(directory, entry);
      if (statSync(path).isDirectory()) return templateSources(path);
      return /\.(ts|tsx|mjs)$/.test(entry) ? [path] : [];
    })
    .sort();
}

const sources = templateSources();

/**
 * Comments stripped before anything is matched against the source.
 *
 * Prose that names a specifier or a role is documentation, and this file reads source for what it
 * declares rather than for what it says about it. The same two passes `tests/dist-esm.test.ts` uses,
 * for the same reason: a `//` inside a string would truncate a line and hide a real import on the
 * rest of it.
 */
const withoutComments = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^[^\S\n]*|[^\S\n])\/\/[^\n]*/g, "$1");

const code = (path: string) => withoutComments(readFileSync(path, "utf8"));
const name = (path: string) => relative(template, path);
const filesMentioning = (pattern: RegExp) =>
  sources.filter((path) => pattern.test(code(path))).map(name);

describe("the starter template", () => {
  it("compiles, because a template nobody compiles is copied stale", () => {
    // The same operation a host's `tsc` performs, run by the same script `pnpm typecheck:template`
    // runs. One script for both, so they cannot answer differently, and the script links the package
    // in first so the check is over the template as a host receives it rather than over a version of
    // it this repository arranged.
    expect(() => typecheckTemplate()).not.toThrow();
  }, 300_000);

  it("reaches the package by name and by nothing else", () => {
    const specifiers = sources.flatMap((path) =>
      [...code(path).matchAll(/\bfrom\s*["']([^"']+)["']|\bimport\s*["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)]
        .map((match) => ({ path: name(path), specifier: match[1] ?? match[2] ?? match[3] }))
        .filter((entry): entry is { path: string; specifier: string } => entry.specifier !== undefined),
    );

    // Every bare specifier has to be one the template's own manifest declares, or a Node builtin. A
    // template that imports something it does not declare installs cleanly and then fails to build,
    // and the failure names a package the person reading the manifest has never heard of.
    const manifest = JSON.parse(readFileSync(join(template, "package.json"), "utf8"));
    const rootManifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    // Bundled UI primitives ship as dependencies of @yesvus/helmdeck now, so a template that
    // imports one of them resolves it transitively even when its own manifest does not name it.
    const declared = new Set([
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.devDependencies ?? {}),
      ...Object.keys(rootManifest.dependencies ?? {}),
    ]);
    const undeclared = specifiers
      .filter(({ specifier }) => !specifier.startsWith(".") && !specifier.startsWith("@/") && !specifier.startsWith("node:"))
      .filter(({ specifier }) => ![...declared].some((name) => specifier === name || specifier.startsWith(`${name}/`)));
    expect(undeclared, "a package the template imports but does not declare").toEqual([]);

    // And nothing reaches out of the template at all. A relative specifier that climbs above
    // `template/` is a specifier that does not exist in the directory the template was copied to.
    const escaping = specifiers
      .filter(({ specifier }) => specifier.startsWith("."))
      .filter(({ path, specifier }) => {
        const from = dirname(join(template, path));
        const target = resolve(from, specifier);
        return target !== template && !target.startsWith(template + sep);
      })
      .map(({ path, specifier }) => `${path}: ${specifier}`);
    expect(escaping, "a relative import that leaves the template").toEqual([]);

    // A path into this repository's own source, or into either of the two trees that are not the
    // template, is the same escape written differently.
    const intoTheRepository = specifiers
      .filter(({ specifier }) => /(^|\/)(src|fixtures|examples|dist|tests)(\/|$)/.test(specifier))
      .map(({ path, specifier }) => `${path}: ${specifier}`);
    expect(intoTheRepository, "an import into a tree the template does not ship").toEqual([]);
  });

  it("decides permission in one file, and no second one anywhere", () => {
    // `rule` is the only property through which a decision enters the package, so a file that names
    // it is a file that has an opinion about who may do what. One such file, and it is the one the
    // store and the browser bridge both import.
    const deciding = filesMentioning(/\brule\s*:/);
    expect(deciding, "a file that hands the package a rule").toEqual(["lib/rules.ts"]);

    // Both ends of one rule, built from the same function, in that file.
    const rules = code(join(template, "lib/rules.ts"));
    expect(rules).toMatch(/createAdminPermissionCheck\(\{\s*rule: can,/);
    expect(rules).toMatch(/createAdminPermissionGuard\(\{\s*rule: can,/);

    // And nothing else reads a role to decide anything. A property read or a comparison anywhere but
    // that one file is the second rule this template exists to not have. The Payload account schema
    // writes a role onto a row, which is not a decision, so it may say the word without saying it
    // twice.
    const roleShape = /\.role\b|\brole\s*(===|!==|==|!=)/;
    expect(filesMentioning(roleShape), "role checks live in the policy modules").toEqual(["lib/payload-access.ts", "lib/rules.ts", "lib/session.ts", "lib/users-guard.ts", "payload.config.ts"]);

    // The two callers that matter reach it rather than reimplementing it, so what the store serves
    // and what the views render cannot answer differently about the same session.
    expect(code(join(template, "lib/persistence.ts"))).toMatch(/createAdminPayloadPersistenceAdapter/);
    expect(code(join(template, "app/(helmdeck)/actions/permission-actions.ts"))).toMatch(/checkPermission/);
  });

  it("uses Payload collection access rules and the package bridge", async () => {
    const source = code(join(template, "payload.config.ts"));
    expect(code(join(template, "lib/session.ts"))).toMatch(/createAdminPayloadAuthStrategy/);
    expect(code(join(template, "lib/session.ts"))).toMatch(/createSessionAuthAdapter/);
    expect(code(join(template, "lib/persistence.ts"))).toMatch(/createAdminPayloadContent/);
    expect(code(join(template, "lib/persistence.ts"))).toMatch(/createAdminPayloadPersistenceAdapter/);
    expect(source).toMatch(/payloadAccess/);
    expect(source).toMatch(/access:\s*\{\s*create:\s*payloadAccess\("create"\),\s*read:\s*payloadAccess\("read"\),\s*update:\s*payloadAccess\("update"\),\s*delete:\s*payloadAccess\("delete"\)/);
    const access = await import("../template/lib/payload-access");
    expect(access.payloadAccess("read")({ req: { user: { role: "editor" } } } as never)).toBe(true);
    expect(access.payloadAccess("delete")({ req: { user: { role: "editor" } } } as never)).toBe(false);
  });

  it("rejects unknown shell permissions", async () => {
    const previous = process.env.HELMDECK_SESSION_SECRET;
    process.env.HELMDECK_SESSION_SECRET = "test-secret-for-permission-policy";
    try {
      vi.resetModules();
      const { can } = await import("../template/lib/rules");
      const session = { role: "admin" } as never;
      expect(can(session, "products.publish" as never)).toBe(false);
      expect(can(session, "products" as never)).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.HELMDECK_SESSION_SECRET;
      else process.env.HELMDECK_SESSION_SECRET = previous;
    }
  });

  it("guards the final admin and self-mutations", async () => {
    const { guardUserDelete, guardUserUpdate } = await import("../template/lib/users-guard");
    const payload = {
      findByID: vi.fn(async () => ({ id: "1", role: "admin" })),
      count: vi.fn(async () => ({ totalDocs: 1 })),
    };
    const req = { user: { id: "1", role: "admin" }, payload };
    expect(await guardUserUpdate({ req, id: "1", data: { role: "editor" } } as never)).toBe(false);
    expect(await guardUserDelete({ req, id: "1" } as never)).toBe(false);
    expect(await guardUserDelete({ req: { ...req, user: { id: "2", role: "admin" } }, id: "1" } as never)).toBe(false);
    payload.count.mockResolvedValue({ totalDocs: 2 });
    expect(await guardUserDelete({ req: { ...req, user: { id: "2", role: "admin" } }, id: "1" } as never)).toBe(true);
  });


  it("refuses to load without a signing secret rather than falling back to a constant", async () => {
    // A constant here is a constant in every host that forgets to configure one, and those hosts
    // would all share it. Asserted as a refusal rather than as a grep, so the property is the
    // behaviour and not the shape of the source.
    vi.resetModules();
    const previous = process.env.HELMDECK_SESSION_SECRET;
    delete process.env.HELMDECK_SESSION_SECRET;
    try {
      await expect(import("../template/lib/session")).rejects.toThrow(/HELMDECK_SESSION_SECRET/);
    } finally {
      if (previous === undefined) delete process.env.HELMDECK_SESSION_SECRET;
      else process.env.HELMDECK_SESSION_SECRET = previous;
    }
  }, 60_000);

  it("ships no account, no record and no address that looks like one", () => {
    // Every string here is either a demo credential or a placeholder address, and every one of them
    // is copied verbatim by the person who copies the template.
    const demo = filesMentioning(
      /helmdeck-demo|DEMO_PASSWORD|demoAccounts|example\.test|example\.com|example\.invalid|@example|changeme|password123|admin123|12345678/i,
    );
    expect(demo, "a demo credential or a placeholder address").toEqual([]);

    // No seeding either. A store that arrives holding rows makes an empty list look like a bug, and
    // the rows a person deletes to make that go away are rows they had to delete.
    const seeded = filesMentioning(/\bseed/i);
    expect(seeded, "something that writes records the host did not create").toEqual([]);
  });

  it("says what a host still has to add, and each of those really is absent", () => {
    // A test cannot check a sentence, so the sentence is checked against the code: every omission
    // the README claims is asserted absent, and the README's list is compared with the one below so
    // neither can gain an item the other does not know about. Compared case-insensitively and
    // without a full stop, because the README's items are written as sentences and a slug that has to
    // be worded exactly to be checkable is a slug somebody will reword.
    const claimed = [...templateReadme.matchAll(/^\d+\. \*\*([^*]+)\*\*/gm)].map((match) =>
      match[1].trim().replace(/\.$/, "").toLowerCase(),
    );
    expect(claimed, "the omissions this file checks").toEqual(OMISSIONS.map((item) => item.slug));

    for (const { slug, absent } of OMISSIONS) {
      expect(absent(), `the template does not leave out ${slug}`).toBe(true);
    }
  });

  it("mounts Payload admin and links product management into it", () => {
    expect(existsSync(join(template, "app/(payload)/layout.tsx"))).toBe(true);
    expect(existsSync(join(template, "app/(helmdeck)/layout.tsx"))).toBe(true);
    expect(existsSync(join(template, "app/layout.tsx"))).toBe(false);
    expect(existsSync(join(template, "app/(payload)/payload/admin/[[...segments]]/page.tsx"))).toBe(true);
    expect(code(join(template, "app/(helmdeck)/admin/products/page.tsx"))).toMatch(/\/payload\/admin\/collections\/products/);
  });

  it("offers a sidebar entry only where a page exists", () => {
    // A link a person cannot follow reads as a feature that is there. Every href the template writes
    // down, in the nav and in the shell's own props, is resolved to a route file.
    const hrefs = sources
      .flatMap((path) => [...code(path).matchAll(/\bhref\s*[=:]\s*["'`]([^"'`]+)["'`]/g)].map((match) => match[1]))
      .filter((href) => href.startsWith("/") && !href.startsWith("//"));

    const missing = hrefs
      .filter((href) => {
        const route = href.split(/[?#]/, 1)[0].replace(/^\//, "");
        if (route.startsWith("payload/admin/")) return !existsSync(join(template, "app/(payload)/payload/admin/[[...segments]]/page.tsx"));
        const group = route.startsWith("payload/") ? "(payload)" : "(helmdeck)";
        if (route.startsWith("payload/admin/")) return !existsSync(join(template, "app/(payload)/payload/admin/[[...segments]]/page.tsx"));
        const relativeRoute = group === "(payload)" ? route.replace(/^payload\//, "") : route;
        const file = relativeRoute === "" ? join(template, "app", group, "page.tsx") : join(template, "app", group, relativeRoute, "page.tsx");
        try {
          return statSync(file).isFile() === false;
        } catch {
          return true;
        }
      });
    expect(missing, "a link with no page behind it").toEqual([]);
  });
});

/**
 * The omissions the template's README lists, each with the check that it really is one.
 *
 * The list is written here first and the README follows it, because a README claiming something is
 * absent is worth nothing if nothing checks that it is. The last one is a positive check: the rule
 * takes no record, which is what "this rule does not read the record" means in source.
 */
const OMISSIONS = [
  {
    slug: "a way to reset a forgotten password",
    absent: () => !anyFile(/\brecovery\b|recoverPassword|forgot|passwordReset/i),
  },
  {
    slug: "a media adapter",
    absent: () => !anyFile(/\bAdminMediaAdapter\b|\bAdminMediaUpload\b/),
  },
  {
    slug: "an audit trail and a cache invalidator",
    absent: () => !anyFile(/\bcreateAuditAdapter\b|\bAdminAuditAdapter\b|\bcreateCacheAdapter\b|\bAdminCacheInvalidationAdapter\b/),
  },
  {
    slug: "a rule that reads the record",
    // The one omission that is positive rather than a symbol's absence: the rule is declared over the
    // session and the permission alone. A third parameter typed `context` would be the shape a
    // per-record rule takes, and the README's claim is that this one does not.
    absent: () =>
      /export function can\(session: AdminSession, permission: AdminPermission\): boolean/.test(
        code(join(template, "lib/rules.ts")),
      ),
  },
  {
    slug: "a second interface language",
    absent: () => !anyFile(/\bAdminLocaleAdapter\b|\bdefineAdminMessages\b|contentLocale/),
  },
  {
    slug: "a contact form endpoint",
    absent: () => !anyFile(/\bAdminContactForm\b|submitContact|contact_messages/),
  },
];

function anyFile(pattern: RegExp): boolean {
  return sources.some((path) => pattern.test(code(path)));
}

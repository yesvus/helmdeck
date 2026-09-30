// SPDX-License-Identifier: MIT
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
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
    expect(() => typecheckTemplate({ quiet: true })).not.toThrow();
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
    const declared = new Set([
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.devDependencies ?? {}),
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
    // that one file is the second rule this template exists to not have. `scripts/create-user.mjs`
    // writes a role onto a row, which is not a decision, so it may say the word without saying it
    // twice.
    const roleShape = /\.role\b|\brole\s*(===|!==|==|!=)/;
    expect(filesMentioning(roleShape), "a role read outside the one rule").toEqual(["lib/rules.ts"]);

    // The two callers that matter reach it rather than reimplementing it, so what the store serves
    // and what the views render cannot answer differently about the same session.
    expect(code(join(template, "lib/store.ts"))).toMatch(/requirePermission/);
    expect(code(join(template, "app/actions/permission-actions.ts"))).toMatch(/checkPermission/);
  });

  it("narrows a write to the declared fields, so a hand-edited request cannot add one", async () => {
    // The form filters what it submits, in the browser. This is the other half: a request that never
    // went through a form reaches the store directly, and a store that takes the value as it was sent
    // will write a field the definition dropped, or an `id` the caller chose. The claim is about the
    // boundary rather than about the form, so it is checked by writing through the boundary and
    // reading back what the store holds.
    //
    // The session is stood in for rather than resolved: it is read from an HTTP-only cookie by the
    // package's server-only adapter, and a cookie this process cannot set is not what is under test.
    // It carries the editor role, which the template's own rule gives every operation but delete, so
    // the refusal at the end is the one rule answering rather than a second check written here.
    const directory = mkdtempSync(join(root, "node_modules", ".helmdeck-starter-"));
    const previous = process.env.HELMDECK_DATABASE_URL;
    process.env.HELMDECK_DATABASE_URL = `file:${join(directory, "writes.db")}`;
    try {
      vi.doMock("../template/lib/session", () => ({
        currentAdminSession: async () => ({ email: "someone@somewhere.test", role: "editor" }),
        auth: {},
        requireAdminSession: async () => ({ email: "someone@somewhere.test", role: "editor" }),
      }));
      const { resourceActions } = await import("../template/lib/store");
      const { persistence } = await import("../template/lib/persistence");

      const written = await resourceActions.create("products", {
        name: "Chair",
        sku: "CHAIR-1",
        price_cents: 12000,
        // None of these three is a declared field. A caller who found this action could send them,
        // and the store is the last place they can be refused.
        isAdmin: true,
        password_hash: "scrypt$salt$key",
      });

      expect(Object.keys(written).sort()).toEqual(["id", "name", "price_cents", "sku"]);

      // The id is the store's, not the caller's, which is the same claim from the other direction: a
      // hand-edited request that names an id must not be able to write over a row that already has it.
      const smuggled = await resourceActions.create("products", {
        id: "chosen-by-the-caller",
        name: "Table",
        sku: "TABLE-1",
        price_cents: 20000,
      });
      expect(smuggled.id).not.toBe("chosen-by-the-caller");

      // And an editor may not delete, which is the rule asked through the same boundary.
      await expect(
        resourceActions.delete("products", String(written.id)),
      ).rejects.toThrow(/may not products\.delete/);
      await persistence.delete("products", String(written.id));
    } finally {
      vi.doUnmock("../template/lib/session");
      if (previous === undefined) delete process.env.HELMDECK_DATABASE_URL;
      else process.env.HELMDECK_DATABASE_URL = previous;
      rmSync(directory, { recursive: true, force: true });
    }
  }, 120_000);

  it("creates an account the sign-in accepts, and refuses a wrong password", async () => {
    // The claim a host makes when they run the command is "I can sign in now", and nothing else here
    // can check it. So the command is run for real against a database in a temporary directory, and
    // the same store the app uses is asked whether the account it wrote verifies. Two facts that can
    // drift and are the usual way this breaks: the column the command writes and the column the
    // sign-in reads, and the address form the command stores and the form the sign-in looks up.
    const directory = mkdtempSync(join(root, "node_modules", ".helmdeck-starter-"));
    const database = join(directory, "accounts.db");
    const password = "a-password-long-enough";
    const previous = process.env.HELMDECK_DATABASE_URL;
    process.env.HELMDECK_DATABASE_URL = `file:${database}`;
    try {
      const created = execFileSync(
        process.execPath,
        [join(template, "scripts", "create-user.mjs"), "someone@somewhere.test", "editor"],
        { input: `${password}\n`, encoding: "utf8", env: { ...process.env } },
      );
      expect(created).toContain("someone@somewhere.test");
      expect(created).not.toContain(password);

      const { authenticate, createPersistenceCredentialStore, createSqlitePersistenceAdapter } =
        await import("@yesvus/helmdeck/baseline");
      const store = createPersistenceCredentialStore(
        createSqlitePersistenceAdapter({ url: `file:${database}` }),
      );

      // The role comes back on the user row, which is where `lib/rules.ts` reads it from. A row
      // that stored it somewhere the session does not carry would leave every account with no role,
      // and the rule's answer to that is nothing at all.
      const verified = await authenticate(store, "  Someone@Somewhere.test ", password);
      expect(verified?.role).toBe("editor");

      // And a wrong password is refused, which is the half that a command writing the wrong column
      // would still pass.
      expect(await authenticate(store, "someone@somewhere.test", "not-the-password")).toBeNull();
    } finally {
      if (previous === undefined) delete process.env.HELMDECK_DATABASE_URL;
      else process.env.HELMDECK_DATABASE_URL = previous;
      rmSync(directory, { recursive: true, force: true });
    }
  }, 120_000);

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

  it("offers a sidebar entry only where a page exists", () => {
    // A link a person cannot follow reads as a feature that is there. Every href the template writes
    // down, in the nav and in the shell's own props, is resolved to a route file.
    const hrefs = sources
      .flatMap((path) => [...code(path).matchAll(/\bhref\s*[=:]\s*["'`]([^"'`]+)["'`]/g)].map((match) => match[1]))
      .filter((href) => href.startsWith("/") && !href.startsWith("//"));

    const missing = hrefs
      .filter((href) => {
        const route = href.split(/[?#]/, 1)[0].replace(/^\//, "");
        const file = route === "" ? join(template, "app", "page.tsx") : join(template, "app", route, "page.tsx");
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
    slug: "a way to create an account",
    absent: () => {
      // One file in the template names the accounts resource, and it is the command a person runs by
      // hand. A second one would be a registration route, which is an unauthenticated write path that
      // has to be there forever and remembered to be closed.
      const naming = filesMentioning(/["'`]users["'`]/);
      return naming.length > 0 && naming.every((file) => file === "scripts/create-user.mjs");
    },
  },
  {
    slug: "a way to reset a forgotten password",
    absent: () => !anyFile(/\brecovery\b|recoverPassword|forgot|passwordReset/i),
  },
  {
    slug: "a settings page",
    absent: () => !anyFile(/\bsettingsHref\b|\/admin\/settings/) && !existsInTemplate("app/admin/settings"),
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
    absent: () => /export function can\(session: AdminSession, permission: AdminPermission\): boolean/.test(code(join(template, "lib/rules.ts"))),
  },
  {
    slug: "a second interface language",
    absent: () => !anyFile(/\bAdminLocaleAdapter\b|\bdefineAdminMessages\b|contentLocale/),
  },
];

function anyFile(pattern: RegExp): boolean {
  return sources.some((path) => pattern.test(code(path)));
}

function existsInTemplate(relativePath: string): boolean {
  try {
    return statSync(join(template, relativePath)).isDirectory();
  } catch {
    return false;
  }
}

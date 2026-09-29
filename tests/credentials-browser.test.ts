// SPDX-License-Identifier: MIT
import { createRequire } from "node:module";
import { mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * A password check has to run where the hash is stored, which is never a browser.
 *
 * The rest of this suite runs in jsdom, which is a browser environment with Node's builtins
 * still reachable, so it can pass a test that says the credential path refuses a browser and
 * still be wrong about a real bundle. So here the credential path is handed to a real bundler
 * with the browser as the target, the output is loaded, and the exported function is called.
 *
 * A bundler is free to answer this question three ways: refuse the module, substitute a stub,
 * or polyfill it. Only the third would be a working browser password check, and it is what the
 * assertion is aimed at. The contrast case is asserted too, because a guard that refused every
 * entry point in the package would pass the first test without having proved anything.
 */

const root = resolve(import.meta.dirname, "..");

type Vite = { build: (options: Record<string, unknown>) => Promise<void> };

/**
 * Vite as vitest resolves it, since the repository does not depend on it directly.
 *
 * Reaching it through vitest's own resolution rather than the root means this keeps working
 * under a hoisted install, a pnpm one and a CI one without the package taking a dependency it
 * does not ship.
 */
async function loadVite(): Promise<Vite> {
  const fromHere = createRequire(import.meta.url);
  const vitestPackage = realpathSync(fromHere.resolve("vitest/package.json"));
  const entry = createRequire(vitestPackage).resolve("vite");
  return import(pathToFileURL(entry).href) as Promise<Vite>;
}

const scratchDirectories: string[] = [];

/**
 * Bundles one baseline module for the browser and loads what it produced.
 *
 * A `package.json` is written alongside because the scratch directory sits under `node_modules`
 * for no reason other than being on the same filesystem, and without one the emitted `.js` is
 * read as CommonJS and cannot be imported at all, which would make a successful build look like
 * a failed one.
 */
async function buildForBrowser(
  vite: Vite,
  module: string,
): Promise<{ exported: (name: string) => unknown; code: string }> {
  const scratch = mkdtempSync(join(root, "node_modules", ".helmdeck-browser-"));
  scratchDirectories.push(scratch);
  writeFileSync(join(scratch, "package.json"), '{ "type": "module" }\n');
  const shim = join(scratch, "entry.ts");
  writeFileSync(shim, `export * from ${JSON.stringify(join(root, "src", "baseline", module))};\n`);

  await vite.build({
    root: scratch,
    configFile: false,
    logLevel: "silent",
    build: {
      lib: { entry: shim, formats: ["es"], fileName: "browser" },
      outDir: join(scratch, "dist"),
      minify: false,
      write: true,
    },
  });

  const out = join(scratch, "dist");
  const file = readdirSync(out).find((name) => name.startsWith("browser"));
  if (!file) throw new Error("the browser build emitted no entry file");
  const code = readFileSync(join(out, file), "utf8");
  const loaded = (await import(pathToFileURL(join(out, file)).href)) as Record<string, unknown>;
  return { exported: (name) => loaded[name], code };
}

describe("the credential path, bundled for a browser", () => {
  let vite: Vite;

  beforeAll(async () => {
    vite = await loadVite();
  }, 60_000);

  afterAll(() => {
    // A directory shaped like a package inside node_modules survives a rebuild and a reinstall,
    // so it is removed whether the build reached its own cleanup or threw before it.
    for (const directory of scratchDirectories) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("cannot hash a password once bundled for a browser", async () => {
    const { exported } = await buildForBrowser(vite, "passwords.ts");
    const hashPassword = exported("hashPassword") as (password: string) => Promise<string>;

    // The bundler may have refused the module, stubbed it, or left a shim that throws on use.
    // All three are refusals. What is not acceptable is a returned hash, because a hash made
    // in a browser is a password check shipped to whoever is probing it.
    expect(typeof hashPassword).toBe("function");
    await expect(hashPassword("correct horse battery staple")).rejects.toThrow();
  }, 120_000);

  it("ships no key derivation of its own for a browser to fall back on", async () => {
    const { code } = await buildForBrowser(vite, "passwords.ts");

    // A bundled fallback would be a second implementation of the check, and the only way to
    // notice one is to look for the cost of doing it. Node's default scrypt parameters are
    // N=16384, r=8, p=1; a browser bundle carrying those has shipped the work to the client.
    expect(code).not.toMatch(/\b16384\b/);
    expect(code).not.toMatch(/pbkdf2/i);
  }, 120_000);

  it("cannot complete a sign-in once bundled for a browser", async () => {
    const { exported } = await buildForBrowser(vite, "credentials.ts");
    const create = exported("createCredentialAuthAdapter") as (options: unknown) => {
      getSession: () => Promise<unknown>;
      login: (credentials: unknown) => Promise<{ ok: boolean }>;
    };
    const store = {
      findUserByEmail: async () => null,
      findUserById: async () => null,
      createSession: async () => ({ id: "s1", userId: "u1", expiresAt: 0 }),
      readSession: async () => null,
      deleteSession: async () => {},
      deleteSessionsForUser: async () => 0,
    };
    const auth = create({ secret: "a-secret-long-enough-to-sign-with", store });

    // The whole adapter, not just the hashing. A credential path that resolves a session in a
    // browser is a credential path a browser could be pointed at a stolen cookie with, and the
    // refusal has to be the browser's own rather than the caller's care.
    await expect(
      auth.login({ email: "owner@example.com", password: "correct horse battery staple" }),
    ).rejects.toThrow();
    await expect(auth.getSession()).rejects.toThrow();
  }, 120_000);
});

describe("the rest of the package, bundled for a browser", () => {
  let vite: Vite;

  beforeAll(async () => {
    vite = await loadVite();
  }, 60_000);

  afterAll(() => {
    for (const directory of scratchDirectories) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("does bundle the session adapter, which signs with Web Crypto", async () => {
    // The contrast that gives the tests above their meaning. `createSessionAuthAdapter` reaches
    // `crypto.subtle` and nothing a browser lacks, so a working bundle of it is the expected
    // result. If this stopped building, the guard above would be refusing everything rather
    // than refusing the credential path.
    const { exported, code } = await buildForBrowser(vite, "session.ts");

    expect(typeof exported("createSessionAuthAdapter")).toBe("function");
    expect(code.length).toBeGreaterThan(0);
  }, 120_000);

  it("does bundle the memory adapter, which has no server-only dependency at all", async () => {
    const { exported } = await buildForBrowser(vite, "memory.ts");

    expect(typeof exported("createMemoryPersistenceAdapter")).toBe("function");
  }, 120_000);
});

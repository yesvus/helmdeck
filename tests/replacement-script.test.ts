// SPDX-License-Identifier: MIT
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { authenticate, createPersistenceCredentialStore, createSqlitePersistenceAdapter } from "../src/baseline";

/**
 * The template's `create-user.mjs`, rewritten as the package's own surface, run as a command.
 *
 * A starter template shipped a 109-line Node command because the package had no way to create the
 * one row it signs in to. This is the same command after the surface landed, executed against a
 * real SQLite file with a password on stdin the way the original is, so what it proves is that the
 * script is shorter and not that a shorter script would work.
 *
 * What the package now owns and the command no longer repeats: the address form, the hash, the
 * duplicate check, the password length, the role vocabulary and the row's shape. What is left is a
 * terminal question and one call, neither of which is a package concern.
 */

const PASSWORD = "correct horse battery staple";

/**
 * The package linked under its own name, the way the template links it, so the child process
 * resolves `@yesvus/helmdeck/baseline` through the real exports map rather than a relative path.
 * That is the thing a host does, and it is why this runs the command rather than calling a function.
 */
function linkPackage(directory: string) {
  const scope = join(directory, "node_modules", "@yesvus");
  mkdirSync(scope, { recursive: true });
  symlinkSync(join(import.meta.dirname, ".."), join(scope, "helmdeck"), "dir");
}

const REPLACEMENT =`import { createAccountAdmin, createPersistenceCredentialStore, createSqlitePersistenceAdapter } from "@yesvus/helmdeck/baseline";

const [email, role = "admin"] = process.argv.slice(2);
const password = await new Promise((done) => {
  process.stdin.setEncoding("utf8");
  let answer = "";
  process.stdin.on("data", (chunk) => { answer += chunk; });
  process.stdin.on("end", () => done(answer.replace(/\\r?\\n$/, "")));
  process.stdin.resume();
});

const store = createPersistenceCredentialStore(
  createSqlitePersistenceAdapter({ url: process.env.HELMDECK_DATABASE_URL }),
);
// The one policy a first account needs, because there is no session yet to be authorized against.
// Every later call goes through the host's own rule with a real session.
const accounts = createAccountAdmin(store, { roles: ["admin", "editor"], may: { create: () => true } });
const created = await accounts.create({ email, role }, { email, password, role });
if (!created.ok) {
  console.error(created.message);
  process.exit(1);
}
console.log(\`Created \${created.account.email} with the role \${created.account.role}.\`);
`;

describe("the account surface as a replacement for the template's script", () => {
  it("creates an account the sign-in accepts, from a command a person runs", async () => {
    const directory = mkdtempSync(join(tmpdir(), "helmdeck-script-"));
    const script = join(directory, "create-user.mjs");
    writeFileSync(script, REPLACEMENT);
    linkPackage(directory);
    try {
      // Run as a child process, because the thing being replaced is a command: the password arrives
      // on stdin and is never echoed, and the address arrives as an argument.
      const output = execFileSync(process.execPath, [script, "you@example.com", "admin"], {
        input: `${PASSWORD}\n`,
        encoding: "utf8",
        env: { ...process.env, HELMDECK_DATABASE_URL: `file:${join(directory, "helmdeck.db")}` },
      });

      expect(output).toContain("you@example.com");
      expect(output).not.toContain(PASSWORD);

      // The same two checks the original script's own test makes, against the real store.
      const store = createPersistenceCredentialStore(
        createSqlitePersistenceAdapter({ url: `file:${join(directory, "helmdeck.db")}` }),
      );
      expect(await authenticate(store, "  You@Example.com ", PASSWORD)).toMatchObject({
        email: "you@example.com",
        role: "admin",
      });
      expect(await authenticate(store, "you@example.com", "not-the-password")).toBeNull();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 60_000);

  it("reports a short password and a role the host does not have, and writes nothing", async () => {
    const directory = mkdtempSync(join(tmpdir(), "helmdeck-script-refused-"));
    const script = join(directory, "create-user.mjs");
    writeFileSync(script, REPLACEMENT);
    const url = `file:${join(directory, "helmdeck.db")}`;
    linkPackage(directory);
    const run = (email: string, role: string, password: string) => {
      try {
        const output = execFileSync(process.execPath, [script, email, role], {
          input: `${password}\n`,
          encoding: "utf8",
          env: { ...process.env, HELMDECK_DATABASE_URL: url },
        });
        return { status: 0, output };
      } catch (error) {
        const failure = error as { status: number; stdout: string; stderr: string };
        return { status: failure.status, output: `${failure.stdout}${failure.stderr}` };
      }
    };
    try {
      // Two refusals the original script had to implement itself, each of which now costs a line
      // of host code that does not exist because the package refuses it.
      expect(run("short@example.com", "admin", "tooshort")).toEqual({
        status: 1,
        output: "That password is shorter than 12 characters. Choose a longer one.\n",
      });
      expect(run("typo@example.com", "admn", PASSWORD)).toEqual({
        status: 1,
        output: 'This host has no role called "admn". It has "admin", "editor".\n',
      });

      // And nothing was written by either, which is what "refused before the hash" means.
      const store = createPersistenceCredentialStore(createSqlitePersistenceAdapter({ url }));
      expect(await store.listUsers!()).toEqual([]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 60_000);
});

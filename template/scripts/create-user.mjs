#!/usr/bin/env node
/**
 * Creates one account, and asks for its password rather than carrying one.
 *
 * The template ships no fixture, no demo account and no password, so this is how a person gets
 * signed in the first time. A seeded account would be copied into production along with everything
 * else here, and a password printed on the sign-in page is a published credential rather than a
 * starting point. A registration page would be worse: it is an unauthenticated write path that has
 * to be there forever and remembered to be closed.
 *
 *   node scripts/create-user.mjs you@example.com admin
 *   node scripts/create-user.mjs you@example.com editor
 *
 * The role is one of the keys in `lib/rules.ts`. An account with a role that map does not define can
 * sign in and may do nothing at all, which is the correct answer rather than a failure.
 */

import { createSqlitePersistenceAdapter, hashPassword, normalizeEmail } from "@yesvus/helmdeck/baseline";
import { databaseUrl } from "../lib/database-url.mjs";

/** The account resource, the same name `createPersistenceCredentialStore` reads. */
const USERS = "users";

/**
 * A question, and a password asked without echoing.
 *
 * A password on the command line is in the shell history and in the process table, and one read
 * from a plain stdin is on the screen. A template is copied into production, so the way it asks for
 * a credential is part of what it teaches.
 */
function ask(question, { secret = false } = {}) {
  const stdin = process.stdin;
  return new Promise((resolve, reject) => {
    if (!stdin.isTTY) {
      reject(new Error(`${question} needs a terminal. Pipe the answer in, or run this from a shell.`));
      return;
    }
    const wasRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    process.stdout.write(question);

    let answer = "";
    const onData = (chunk) => {
      const character = String(chunk);
      if (character === "\r" || character === "\n" || character === "\u0004") {
        stdin.setRawMode(wasRaw);
        stdin.pause();
        stdin.off("data", onData);
        process.stdout.write("\n");
        resolve(answer);
        return;
      }
      if (character === "\u0003") {
        process.stdout.write("\n");
        process.exit(130);
      }
      if (character === "\u007F" || character === "\b") {
        answer = answer.slice(0, -1);
        return;
      }
      answer += character;
      if (!secret) process.stdout.write(character);
    };
    stdin.on("data", onData);
  });
}

const [email, role = "admin"] = process.argv.slice(2);
if (!email) {
  console.error("usage: node scripts/create-user.mjs <email> [role]");
  process.exit(2);
}

const password = await ask(`Password for ${email}: `, { secret: true });
if (password.length < 12) {
  console.error("That is shorter than twelve characters. Choose a longer one and run this again.");
  process.exit(2);
}

const persistence = createSqlitePersistenceAdapter({ url: databaseUrl });
const address = normalizeEmail(email);
const existing = await persistence.query(USERS, { email: address });
if (existing.length > 0) {
  console.error(`${address} already has an account. Change the password through your own screen.`);
  process.exit(1);
}

await persistence.create(USERS, {
  email: address,
  // `scrypt$<salt>$<key>`, which is what the sign-in's `verifyPassword` reads. Storing the address
  // through `normalizeEmail` is what makes the lookup find this row again.
  password_hash: await hashPassword(password),
  role,
});

console.log(`Created ${address} with the role ${role}.`);

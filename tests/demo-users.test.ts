// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { authenticate, hashPassword, verifyPassword, type DemoUser } from "../fixtures/lib/demo-users";

const PASSWORD = "correct horse battery staple";

async function user(overrides: Partial<DemoUser> = {}): Promise<DemoUser> {
  return {
    id: "u1",
    email: "owner@example.com",
    role: "admin",
    passwordHash: await hashPassword(PASSWORD),
    ...overrides,
  };
}

describe("hashPassword", () => {
  it("never stores the password itself", async () => {
    const hash = await hashPassword(PASSWORD);

    expect(hash).not.toContain(PASSWORD);
    expect(hash.startsWith("scrypt$")).toBe(true);
  });

  it("salts, so the same password hashes differently each time", async () => {
    const [a, b] = await Promise.all([hashPassword(PASSWORD), hashPassword(PASSWORD)]);

    // Without a salt, two accounts with the same password are visibly identical in a dump.
    expect(a).not.toBe(b);
  });
});

describe("verifyPassword", () => {
  it("accepts the right password", async () => {
    expect(await verifyPassword(PASSWORD, await hashPassword(PASSWORD))).toBe(true);
  });

  it("rejects a wrong password", async () => {
    expect(await verifyPassword("wrong", await hashPassword(PASSWORD))).toBe(false);
  });

  it("rejects a malformed stored hash rather than throwing", async () => {
    // A row that never got hashed must fail the login, not take the page down.
    expect(await verifyPassword(PASSWORD, "plaintext")).toBe(false);
    expect(await verifyPassword(PASSWORD, "")).toBe(false);
  });

  it("rejects a stored hash whose key decodes to nothing", async () => {
    // "!" is not base64, so it decodes to a zero-length key, and deriving one of length zero is the
    // kind of input that throws rather than returning a wrong answer.
    expect(await verifyPassword(PASSWORD, "scrypt$c2FsdA==$!")).toBe(false);
  });
});

describe("authenticate", () => {
  it("returns the user for correct credentials", async () => {
    const owner = await user();

    expect((await authenticate([owner], "owner@example.com", PASSWORD))?.id).toBe("u1");
  });

  it("matches the email without regard to case or surrounding space", async () => {
    const owner = await user();

    expect((await authenticate([owner], "  Owner@Example.com ", PASSWORD))?.id).toBe("u1");
  });

  it("rejects a wrong password without saying which half was wrong", async () => {
    const owner = await user();

    expect(await authenticate([owner], "owner@example.com", "wrong")).toBeNull();
  });

  it("answers an unknown email the same way as a wrong password", async () => {
    // If these differed, the form would report which addresses are registered.
    const owner = await user();
    const unknown = await authenticate([owner], "nobody@example.com", PASSWORD);
    const wrongPassword = await authenticate([owner], "owner@example.com", "wrong");

    expect(unknown).toBeNull();
    expect(unknown).toEqual(wrongPassword);
  });

  it("does not take noticeably less time for an unknown email than a wrong password", async () => {
    // An answer that is merely equal, but much faster, still enumerates users. The margin is loose on
    // purpose: this is a smoke check against a gross difference, not a benchmark.
    const owner = await user();
    const timeFor = async (email: string) => {
      const started = process.hrtime.bigint();
      await authenticate([owner], email, "wrong");
      return Number(process.hrtime.bigint() - started) / 1e6;
    };

    await timeFor("owner@example.com");
    const unknown = await timeFor("nobody@example.com");
    const known = await timeFor("owner@example.com");

    expect(unknown).toBeGreaterThan(known * 0.2);
  });
});

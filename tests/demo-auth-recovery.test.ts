// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { demoAccounts } from "../fixtures/lib/demo-accounts";
import {
  createDemoRecovery,
  demoRecovery,
  demoRecoveryTransport,
  RECOVERY_CONFIRMATION,
  RECOVERY_NOT_CONFIGURED,
  RECOVERY_SPENT_TOKEN,
  RECOVERY_TOKEN_TTL_SECONDS,
  recoveryRecords,
  resetDemoRecovery,
  type RecoveryDelivery,
  type RecoveryTransport,
} from "../fixtures/lib/demo-auth-recovery";
import { requestPasswordRecoveryAction } from "../fixtures/app/login/actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const [owner, editor] = demoAccounts;
const stranger = "nobody@demo.helmdeck.dev";

/** A host's transport, and what it was asked for. The host mints and the host delivers. */
function hostTransport() {
  const sent: RecoveryDelivery[] = [];
  const issued: string[] = [];
  let counter = 0;
  const transport: RecoveryTransport = {
    issueToken: () => {
      counter += 1;
      const token = `host-token-${counter}-0123456789abcdef0123456789abcdef`;
      issued.push(token);
      return token;
    },
    send: (delivery) => {
      sent.push(delivery);
    },
  };
  return { transport, sent, issued };
}

beforeEach(() => {
  resetDemoRecovery();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("a recovery the host has not configured", () => {
  it("says so, rather than answering as though a link were on its way", async () => {
    const recovery = createDemoRecovery();

    const result = await recovery.request(owner.email);

    expect(recovery.configured).toBe(false);
    expect(result).toEqual({ ok: false, status: "not-configured", message: RECOVERY_NOT_CONFIGURED });
    // The confirmation is the message a host sends from. This one is not it, because nothing was sent.
    expect(result.message).not.toBe(RECOVERY_CONFIRMATION);
  });

  it("writes no token down, since there is nowhere it could be used", async () => {
    await createDemoRecovery().request(owner.email);

    expect(recoveryRecords()).toEqual([]);
  });

  it("answers an address with no account exactly as it answers one that has", async () => {
    const recovery = createDemoRecovery();

    const unknown = await recovery.request(stranger);
    const known = await recovery.request(owner.email);

    // Equal answers, not merely two refusals: a form whose answer changes with the address is how
    // a list of who has an account here gets built.
    expect(unknown).toEqual(known);
    expect(unknown.ok).toBe(false);
  });
});

describe("a recovery the host has configured", () => {
  it("hands a token to the host's own sender", async () => {
    const host = hostTransport();
    const recovery = createDemoRecovery({ transport: host.transport, now: () => Date.UTC(2026, 0, 1) });

    const result = await recovery.request(owner.email);

    expect(recovery.configured).toBe(true);
    expect(result).toEqual({ ok: true, status: "accepted", message: RECOVERY_CONFIRMATION });
    expect(host.sent).toEqual([
      {
        email: owner.email,
        token: "host-token-1-0123456789abcdef0123456789abcdef",
        expiresAt: new Date(Date.UTC(2026, 0, 1) + RECOVERY_TOKEN_TTL_SECONDS * 1000),
      },
    ]);
  });

  it("gives the token back the account it was issued for", async () => {
    const host = hostTransport();
    const recovery = createDemoRecovery({ transport: host.transport });

    await recovery.request(owner.email);
    const result = await recovery.redeem(host.sent[0].token);

    expect(result).toEqual({ ok: true, status: "redeemed", accountId: owner.id, email: owner.email });
  });

  it("gives an editor's token the editor and nothing else", async () => {
    const host = hostTransport();
    const recovery = createDemoRecovery({ transport: host.transport });

    await recovery.request(editor.email);

    expect(await recovery.redeem(host.sent[0].token)).toEqual({
      ok: true,
      status: "redeemed",
      accountId: editor.id,
      email: editor.email,
    });
  });

  it("answers an address with no account exactly as it answers one that has", async () => {
    const host = hostTransport();
    const recovery = createDemoRecovery({ transport: host.transport });

    const unknown = await recovery.request(stranger);
    const known = await recovery.request(owner.email);

    // Equal answers, not merely two confirmations. This is the property the demo's own sign-in has
    // for a wrong password, and a reset form that gives it away is the same oracle with a new name.
    expect(unknown).toEqual(known);
    expect(unknown.ok).toBe(true);
  });

  it("mints for an address with no account, so the answer does not arrive sooner", async () => {
    const host = hostTransport();
    const recovery = createDemoRecovery({ transport: host.transport });

    await recovery.request(stranger);

    // Same work either way. A request that skipped the expensive part would answer the question
    // "who has an account here" in timings, however identical the two responses read.
    expect(host.issued).toHaveLength(1);
  });

  it("sends nothing at all for an address with no account", async () => {
    const host = hostTransport();
    const recovery = createDemoRecovery({ transport: host.transport });

    await recovery.request(stranger);
    await recovery.request(owner.email);

    // The token that was minted for the stranger was never written down and never left the process,
    // which is the only reason minting one costs nothing here.
    expect(host.sent.map((delivery) => delivery.email)).toEqual([owner.email]);
    expect(recoveryRecords()).toHaveLength(1);
  });

  it("tells the host its sender failed, and answers the visitor the same way", async () => {
    const host = hostTransport();
    const failures: unknown[] = [];
    const recovery = createDemoRecovery({
      transport: { ...host.transport, send: () => Promise.reject(new Error("no route to host")) },
      onDeliveryError: (error) => failures.push(error),
    });

    const result = await recovery.request(owner.email);

    // A host that could not deliver is told. The visitor is not, because a delivery failure is one
    // more thing that differs between an address the host knows and one it does not.
    expect(failures).toHaveLength(1);
    expect(result.message).toBe(RECOVERY_CONFIRMATION);
  });
});

describe("what the store is holding while a token is outstanding", () => {
  it("holds no token that can be used, and no part of one", async () => {
    const host = hostTransport();
    await createDemoRecovery({ transport: host.transport }).request(owner.email);
    const issued = host.sent[0].token;

    const records = recoveryRecords();
    expect(records).toHaveLength(1);
    expect(records[0].accountId).toBe(owner.id);

    // A salted digest rather than the token: a copy of the store is a list of accounts waiting, not
    // a list of reset links that work. Searched in the stored form and in the bytes behind it, so
    // base64 cannot hide a value that is sitting right there. Checked against a chunk as well as the
    // whole, because a token written down in pieces is a token written down.
    const decoded = records
      .flatMap((record) => [record.salt, record.digest])
      .map((value) => Buffer.from(value, "base64").toString("utf8"));
    const atRest = JSON.stringify(records) + decoded.join("");

    expect(atRest).not.toContain(issued);
    expect(atRest).not.toContain(issued.slice(0, 16));
    expect(decoded.join("")).not.toContain(issued);
  });

  it("salts each request separately, so two records are not two copies of one digest", async () => {
    const host = hostTransport();
    await createDemoRecovery({ transport: host.transport }).request(owner.email);
    await createDemoRecovery({ transport: host.transport }).request(editor.email);

    const [first, second] = recoveryRecords();
    expect(first.salt).not.toBe(second.salt);
    expect(first.digest).not.toBe(second.digest);
  });

  it("logs nothing, so a token does not turn up in a log tail either", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const host = hostTransport();
    const recovery = createDemoRecovery({ transport: host.transport });

    await recovery.request(owner.email);
    await recovery.redeem(host.sent[0].token);

    expect([...log.mock.calls, ...warn.mock.calls, ...error.mock.calls].join(" ")).not.toContain(
      host.issued[0],
    );
  });
});

describe("a token, once it is spent", () => {
  it("works for the length of its life and no longer", async () => {
    let clock = Date.UTC(2026, 0, 1);
    const host = hostTransport();
    const recovery = createDemoRecovery({ transport: host.transport, now: () => clock });

    await recovery.request(owner.email);
    clock += RECOVERY_TOKEN_TTL_SECONDS * 1000 - 1;
    expect((await recovery.redeem(host.sent[0].token)).ok).toBe(true);

    const second = hostTransport();
    const another = createDemoRecovery({ transport: second.transport, now: () => clock });
    await another.request(owner.email);
    clock += RECOVERY_TOKEN_TTL_SECONDS * 1000 + 1;

    const late = await another.redeem(second.sent[0].token);

    expect(late).toEqual({ ok: false, status: "spent", message: RECOVERY_SPENT_TOKEN });
  });

  it("drops the record it refuses, rather than leaving it to be looked at again", async () => {
    let clock = Date.UTC(2026, 0, 1);
    const host = hostTransport();
    const recovery = createDemoRecovery({ transport: host.transport, now: () => clock });

    await recovery.request(owner.email);
    clock += RECOVERY_TOKEN_TTL_SECONDS * 1000 + 1;
    await recovery.redeem(host.sent[0].token);

    expect(recoveryRecords()).toEqual([]);
  });

  it("refuses a second use of the same token", async () => {
    const host = hostTransport();
    const recovery = createDemoRecovery({ transport: host.transport });
    await recovery.request(owner.email);

    expect((await recovery.redeem(host.sent[0].token)).ok).toBe(true);
    expect(await recovery.redeem(host.sent[0].token)).toEqual({
      ok: false,
      status: "spent",
      message: RECOVERY_SPENT_TOKEN,
    });
  });

  it("stops working when the same account asks again", async () => {
    const host = hostTransport();
    const recovery = createDemoRecovery({ transport: host.transport });

    await recovery.request(owner.email);
    await recovery.request(owner.email);

    // The newest request is the only one that works, so a link pulled out of an inbox a second
    // message has superseded is already dead.
    expect(await recovery.redeem(host.sent[0].token)).toEqual({
      ok: false,
      status: "spent",
      message: RECOVERY_SPENT_TOKEN,
    });
    expect((await recovery.redeem(host.sent[1].token)).ok).toBe(true);
    expect(recoveryRecords()).toEqual([]);
  });

  it("refuses a token that was never issued", async () => {
    const recovery = createDemoRecovery({ transport: hostTransport().transport });

    expect(await recovery.redeem("token-1")).toEqual({
      ok: false,
      status: "spent",
      message: RECOVERY_SPENT_TOKEN,
    });
    expect(await recovery.redeem("")).toEqual({
      ok: false,
      status: "spent",
      message: RECOVERY_SPENT_TOKEN,
    });
  });

  it("refuses a token with one character changed, and leaves the good one working", async () => {
    const host = hostTransport();
    const recovery = createDemoRecovery({ transport: host.transport });
    await recovery.request(owner.email);
    const token = host.sent[0].token;

    expect((await recovery.redeem(`${token}x`)).ok).toBe(false);
    expect((await recovery.redeem(token)).ok).toBe(true);
  });
});

describe("the sender the demo ships", () => {
  it("is off, so the demo refuses rather than mailing nobody", () => {
    expect(demoRecoveryTransport({})).toBeUndefined();
    expect(demoRecoveryTransport({ HELMDECK_RECOVERY_WEBHOOK: "   " })).toBeUndefined();
    expect(demoRecovery().configured).toBe(false);
  });

  it("posts the token to the endpoint the operator named, and nowhere else", async () => {
    const fetchSpy = vi.fn<typeof fetch>(async () => new Response("", { status: 202 }));
    vi.stubGlobal("fetch", fetchSpy);
    const transport = demoRecoveryTransport({
      HELMDECK_RECOVERY_WEBHOOK: "https://hooks.example/recover",
    });
    const recovery = createDemoRecovery({ transport, now: () => Date.UTC(2026, 0, 1) });

    await recovery.request(owner.email);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://hooks.example/recover");
    const posted = JSON.parse(String(init?.body));
    expect(Object.keys(posted).sort()).toEqual(["email", "expiresAt", "token"]);
    expect(posted.email).toBe(owner.email);
    expect(posted.token).toEqual(expect.stringMatching(/^[0-9a-f]{64}$/));
    expect(posted.expiresAt).toBe(new Date(Date.UTC(2026, 0, 1) + RECOVERY_TOKEN_TTL_SECONDS * 1000).toISOString());
  });

  it("keeps the token out of the URL and the method readable, so it is not left in a proxy log", async () => {
    const fetchSpy = vi.fn<typeof fetch>(async () => new Response("", { status: 202 }));
    vi.stubGlobal("fetch", fetchSpy);
    const transport = demoRecoveryTransport({
      HELMDECK_RECOVERY_WEBHOOK: "https://hooks.example/recover",
    });

    await createDemoRecovery({ transport }).request(owner.email);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).not.toContain("token");
    expect(init?.method).toBe("POST");
    expect(init?.redirect).toBe("error");
  });

  it("reports an endpoint that refused, without turning it into an answer to the visitor", async () => {
    const failures: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => new Response("", { status: 500 })));
    const transport = demoRecoveryTransport({
      HELMDECK_RECOVERY_WEBHOOK: "https://hooks.example/recover",
    });
    const recovery = createDemoRecovery({ transport, onDeliveryError: (error) => failures.push(error) });

    const result = await recovery.request(owner.email);

    expect(failures).toHaveLength(1);
    expect(result.message).toBe(RECOVERY_CONFIRMATION);
  });
});

describe("the action a sign-in page calls", () => {
  it("answers for the address nobody has the way it answers for the owner", async () => {
    const unknown = await requestPasswordRecoveryAction(stranger);
    const known = await requestPasswordRecoveryAction(owner.email);

    expect(unknown).toEqual(known);
    expect(unknown.ok).toBe(false);
  });

  it("normalises the address the way sign-in does", async () => {
    const cased = await requestPasswordRecoveryAction(`  ${owner.email.toUpperCase()} `);
    const plain = await requestPasswordRecoveryAction(owner.email);

    expect(cased).toEqual(plain);
  });

  it("says the flow is not configured, which is this deployment's honest answer", async () => {
    expect(await requestPasswordRecoveryAction(owner.email)).toEqual({
      ok: false,
      message: RECOVERY_NOT_CONFIGURED,
    });
    expect(RECOVERY_NOT_CONFIGURED).not.toBe(RECOVERY_CONFIRMATION);
  });
});

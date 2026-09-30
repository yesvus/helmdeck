// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from "vitest";
import {
  ADMIN_RESOURCE_IMPORT_MAX_FAILURES,
  AdminResourceImportError,
  adminCsvRecords,
  adminResourceImport,
  adminResourceImportResult,
  type AdminResourceImportOutcome,
} from "@yesvus/helmdeck";
import { createAdminPermissionGuard } from "../src/shell/permission-rule";
import { createAdminResourceActions } from "../src/resources/actions";
import { createMemoryPersistenceAdapter } from "../src/baseline/memory";
import { demoCan, exposedResource } from "../fixtures/lib/demo-rules";
import type { AdminSession } from "../src/adapters/index";

/**
 * A file read into a store, one row at a time, and what a row that cannot be written does to the rows
 * around it.
 *
 * The write is a seam-shaped stub wherever the property is about the importer and the demo's own rule
 * wherever the property is about a refusal, because a test that made its own rule could agree with the
 * demo's today and not tomorrow, and "a session that may not read a row does not get it" is only
 * worth anything if the rule being asked is the one that governs.
 */

type Outcome = AdminResourceImportOutcome;

const columns = [
  { name: "name" },
  { name: "sku" },
  { name: "price_cents", parse: (text: string | null) => (text === null ? null : Number(text)) },
];

/** A store the importer writes through, recording what reached it. */
function writing() {
  const written: Array<Record<string, unknown>> = [];
  const actions = {
    create: async (_resource: string, values: Record<string, unknown>) => {
      written.push(values);
      return { id: `r${written.length}`, ...values };
    },
  };
  return { actions, written };
}

/** A file the caller hands over in pieces, so a read can be watched rather than trusted. */
async function* pieces(text: string, size: number): AsyncGenerator<string> {
  for (let at = 0; at < text.length; at += size) yield text.slice(at, at + size);
}

async function collect(outcomes: AsyncIterable<Outcome>): Promise<Outcome[]> {
  const seen: Outcome[] = [];
  for await (const outcome of outcomes) seen.push(outcome);
  return seen;
}

describe("a file read as records", () => {
  it("reads the same records whether it arrives whole or a character at a time", async () => {
    // The property that makes one importer the importer for the first row and the ten thousandth: the
    // pieces a caller splits a file into cannot change what the file said. A character at a time is
    // the worst split there is, and it splits between the two halves of a character above the basic
    // plane as readily as between two of ASCII.
    const file = [
      "id,name,note",
      "1,Amber lamp,\"a note, with a comma\"",
      "2,ÉCOLE lamp,\"a \"\"quoted\"\" word\"",
      "3,\"line\nbreak\",plain",
      "4,trailing,",
    ].join("\r\n");

    const whole = await collect(adminCsvRecords(`${file}\r\n`));
    const split = await collect(adminCsvRecords(pieces(`${file}\r\n`, 1)));

    expect(split).toEqual(whole);
    expect(whole.map((record) => record.cells)).toEqual([
      ["id", "name", "note"],
      ["1", "Amber lamp", "a note, with a comma"],
      ["2", "ÉCOLE lamp", 'a "quoted" word'],
      ["3", "line\nbreak", "plain"],
      ["4", "trailing", ""],
    ]);
    expect(whole.every((record) => record.error === null)).toBe(true);
  });

  it("counts a line by the line a person editing the file is looking at", async () => {
    // A row holding a newline spans lines, so the rows below it are numbered past it rather than at
    // it. A file where every row is on the line after the one before it is a file nobody can fix by
    // going to the line the report named.
    const records = await collect(
      adminCsvRecords('id,note\r\n1,"two\r\nlines"\r\n2,plain\r\n3,also plain\r\n'),
    );

    expect(records.map((record) => record.line)).toEqual([1, 2, 4, 5]);
  });

  it("reads a file of bytes, and a mark at the front of it as the mark and not as a name", async () => {
    // A spreadsheet writes a byte-order mark to say the file is not Latin-1, and every parser has to
    // deal with it. A mark left on the first column's name is a column the import cannot match to
    // anything the host declared.
    const bytes = new TextEncoder().encode("\ufeffid,name\r\n1,Amber lamp\r\n");

    expect(await collect(adminCsvRecords(bytes))).toEqual([
      { line: 1, cells: ["id", "name"], error: null },
      { line: 2, cells: ["1", "Amber lamp"], error: null },
    ]);
    // Split across the middle of the mark's own bytes, which is where a chunked upload can cut one.
    const split = new Uint8Array([...bytes.slice(0, 2), ...bytes.slice(2)]);
    expect(await collect(adminCsvRecords([split]))).toEqual(await collect(adminCsvRecords(bytes)));
  });

  it("reports a record it cannot read and picks the next one up, rather than losing the file", async () => {
    // One stray quote in the middle of a file is one row a person can fix. Refusing the file would
    // take every other row with it, and an importer that stops is an importer nobody runs twice.
    const records = await collect(
      adminCsvRecords('id,name\r\n1,fine\r\n2,"closed" then junk\r\n3,also fine\r\n4,fine too\r\n'),
    );

    expect(records[2]).toEqual({
      line: 3,
      cells: [],
      error:
        'the cell closed by a quote on line 3 is followed by " ", which is neither a comma nor a line break',
    });
    // The row after the broken one is read from its own line, and the rest of the broken line is not
    // read as values.
    expect(records[3]).toEqual({ line: 4, cells: ["3", "also fine"], error: null });
    expect(records).toHaveLength(5);
  });

  it("says a file that ends inside a quoted cell has no last row, rather than writing half of one", async () => {
    const records = await collect(adminCsvRecords('id,name\r\n1,fine\r\n2,"never closed'));

    expect(records[records.length - 1]).toEqual({
      line: 3,
      cells: [],
      error: "the quoted cell on line 3 is never closed, so the rest of the file is inside it",
    });
  });

  it("reads no record from an empty file, and no row from a line that holds nothing", async () => {
    expect(await collect(adminCsvRecords(""))).toEqual([]);
    // The break after the last row is one, and a blank line between two rows is not a row of nothing.
    expect(await collect(adminCsvRecords("id,name\r\n1,fine\r\n\r\n2,fine\r\n"))).toHaveLength(3);
  });
});

describe("a row written", () => {
  it("is written before the next one is read", async () => {
    // The order of two events, not a count: a batch that read the file and then wrote it would read
    // all five rows before writing the first, and this is the assertion that fails instead.
    const order: string[] = [];
    const file = ["name,sku", ...Array.from({ length: 5 }, (_, index) => `Product ${index},SKU-${index}`)].join("\n");
    const actions = {
      create: async (_resource: string, values: Record<string, unknown>) => {
        order.push(`write ${String(values.name)}`);
        return values;
      },
    };

    const rows = (async function* () {
      for (const [index, line] of file.split("\n").entries()) {
        order.push(`read ${index}`);
        yield `${line}\n`;
      }
    })();

    const seen = await collect(adminResourceImport({ actions, resource: "products", columns, rows }));

    expect(seen).toHaveLength(5);
    expect(order.slice(0, 4)).toEqual(["read 0", "read 1", "write Product 0", "read 2"]);
    expect(order).toHaveLength(11);
  });

  it("takes its values from the file's own header, and reads a missing cell as nothing", async () => {
    const { actions, written } = writing();

    const seen = await collect(
      adminResourceImport({
        actions,
        resource: "products",
        columns,
        rows: "name,sku,price_cents\r\nAmber lamp,LAMP-001,4900\r\nRisr,RISR-001,\r\n",
      }),
    );

    expect(seen.every((outcome) => outcome.kind === "written")).toBe(true);
    expect(written).toEqual([
      { name: "Amber lamp", sku: "LAMP-001", price_cents: 4900 },
      // The empty cell is the absence of a price, and the column's parse is what says so. A CSV
      // carries text, so `007` is left as it was written rather than becoming seven.
      { name: "Risr", sku: "RISR-001", price_cents: null },
    ]);
  });

  it("gives a column the host did not declare the file's own text, and leaves the write to decide", async () => {
    const { actions, written } = writing();

    await collect(
      adminResourceImport({
        actions,
        resource: "products",
        columns: [{ name: "name" }],
        rows: "name,sku,note\r\nAmber lamp,LAMP-001,a note\r\n",
      }),
    );

    // Which fields a write accepts is the write boundary's decision, and this importer has not read
    // the resource's definition to know it. Dropping them here would be a second answer to that.
    expect(written).toEqual([{ name: "Amber lamp", sku: "LAMP-001", note: "a note" }]);
  });

  it("reads a cell the mark was put on back as the value it was written from", async () => {
    const { actions, written } = writing();

    await collect(
      adminResourceImport({
        actions,
        resource: "products",
        columns,
        rows: [
          "name,sku,price_cents",
          "=cmd|' /C calc'!A0,SK-1,1",
          "+1+1,SK-2,2",
          "-3.5,SK-3,3",
          // The marked form of a value whose own first character is the mark, which is the case one
          // rule cannot read both ways.
          "''=1+1,SK-4,4",
        ].join("\n"),
      }),
    );

    // A value the export marked and the import did not unmark is a name that reaches a store with a
    // character on the front of it, and a file of them is a file that re-exports differently each time.
    expect(written).toEqual([
      { name: "=cmd|' /C calc'!A0", sku: "SK-1", price_cents: 1 },
      { name: "+1+1", sku: "SK-2", price_cents: 2 },
      { name: "-3.5", sku: "SK-3", price_cents: 3 },
      { name: "'=1+1", sku: "SK-4", price_cents: 4 },
    ]);
  });
});

describe("a row that cannot be written", () => {
  const file = (bad: number, total: number) =>
    [
      "name,sku",
      ...Array.from({ length: total }, (_, index) =>
        index === bad ? `Product ${index},` : `Product ${index},SKU-${index}`,
      ),
    ].join("\n") + "\n";

  /** A store that refuses any write naming a sku of nothing, as a required column's store would. */
  function refusing() {
    const written: string[] = [];
    const actions = {
      create: async (_resource: string, values: Record<string, unknown>) => {
        if (values.sku === null) throw new Error("sku is required");
        written.push(String(values.sku));
        return values;
      },
    };
    return { actions, written };
  }

  it("leaves the rows around it written, and says which line failed", async () => {
    const { actions, written } = refusing();

    const result = await adminResourceImportResult({
      actions,
      resource: "products",
      columns: [{ name: "name" }, { name: "sku" }],
      rows: file(2, 5),
    });

    expect(result).toEqual({
      resource: "products",
      read: 5,
      written: 4,
      failed: 1,
      stopped: false,
      failures: [{ line: 4, kind: "rejected", reason: "sku is required" }],
      failuresDropped: 0,
    });
    // The four good rows are in the store, in the file's order, and the bad one is not. This is the
    // decision the whole importer is built on, so it is asserted on both the count and the store.
    expect(written).toEqual(["SKU-0", "SKU-1", "SKU-3", "SKU-4"]);
  });

  it("is the same row, refused the same way, in a file of one and in a file of a thousand", async () => {
    // The requirement, taken literally: the importer for the first row and the ten thousandth. A
    // decision that depended on the batch would pass one of these two and fail the other, so both are
    // asked and the row's own outcome is compared.
    const one = refusing();
    const thousand = refusing();

    const alone = await adminResourceImportResult({
      actions: one.actions,
      resource: "products",
      columns: [{ name: "name" }, { name: "sku" }],
      rows: "name,sku\nProduct 500,\n",
    });
    const many = await adminResourceImportResult({
      actions: thousand.actions,
      resource: "products",
      columns: [{ name: "name" }, { name: "sku" }],
      rows: file(500, 1000),
    });

    expect(alone.failed).toBe(1);
    expect(many.failed).toBe(1);
    // The same kind of refusal and the same words, on the line that row happens to sit on in each of
    // the two files. A decision that depended on the batch would pass one of these and fail the
    // other, which is the whole of the requirement.
    expect({ ...alone.failures[0], line: 0 }).toEqual({ ...many.failures[0], line: 0 });
    expect(alone.failures[0].line).toBe(2);
    expect(many.failures[0].line).toBe(502);
    // The rows on either side of it are written in both runs, which is the half that a batch could
    // only get right by rolling back.
    expect(one.written).toEqual([]);
    expect(thousand.written).toHaveLength(999);
    expect(thousand.written[499]).toBe("SKU-499");
    expect(thousand.written[500]).toBe("SKU-501");
  });

  it("stops at the first failure when the caller asks it to, and says that it did", async () => {
    const { actions, written } = refusing();

    const result = await adminResourceImportResult({
      actions,
      resource: "products",
      columns: [{ name: "name" }, { name: "sku" }],
      rows: file(1, 5),
      stopOnError: true,
    });

    expect(result).toEqual({
      resource: "products",
      read: 2,
      written: 1,
      failed: 1,
      stopped: true,
      failures: [{ line: 3, kind: "rejected", reason: "sku is required" }],
      failuresDropped: 0,
    });
    expect(written).toEqual(["SKU-0"]);
  });

  it("counts the failures past the cap rather than dropping them, because a count of twenty is not a count", async () => {
    const rows = ["name,sku", ...Array.from({ length: 40 }, () => "Product,")].join("\n");
    const { actions, written } = refusing();

    const result = await adminResourceImportResult({
      actions,
      resource: "products",
      columns: [{ name: "name" }, { name: "sku" }],
      rows,
    });

    expect(result.failed).toBe(40);
    expect(result.written).toBe(0);
    expect(result.failures).toHaveLength(ADMIN_RESOURCE_IMPORT_MAX_FAILURES);
    expect(result.failuresDropped).toBe(40 - ADMIN_RESOURCE_IMPORT_MAX_FAILURES);
    expect(written).toEqual([]);
  });

  it("reports a row it cannot read as malformed rather than writing half of it", async () => {
    const { actions, written } = writing();

    const result = await adminResourceImportResult({
      actions,
      resource: "products",
      columns,
      // Three cells against a three column header on one row, four on another: a row with more cells
      // than the file names has values with nowhere to go, and reading them as a longer row would put
      // them in fields the file never declared.
      rows: "name,sku,price_cents\r\nfine,SK-1,1\r\na,b,c,d\r\nalso fine,SK-2,2\r\n",
    });

    expect(result.read).toBe(3);
    expect(result.written).toBe(2);
    expect(result.failures).toEqual([
      { line: 3, kind: "malformed", reason: "the row on line 3 holds 4 cells and the header names 3" },
    ]);
    expect(written.map((values) => values.name)).toEqual(["fine", "also fine"]);
  });

  it("refuses a file whose header cannot be read, before any row is written", async () => {
    const { actions, written } = writing();
    const header = (text: string) =>
      adminResourceImportResult({ actions, resource: "products", columns, rows: text });

    // Nothing can be written from a file whose columns cannot be read, and the refusal is the whole
    // of the answer: a run that wrote what it could have made up a file of guesses.
    await expect(header("")).rejects.toThrow(AdminResourceImportError);
    await expect(header("name,,sku\r\na,b,c\r\n")).rejects.toThrow(/column with no name/);
    await expect(header("name,name\r\na,b\r\n")).rejects.toThrow(/twice/);
    await expect(header('"never closed,name\r\na,b\r\n')).rejects.toThrow(/never closed/);
    expect(written).toEqual([]);
  });

  it("refuses two columns of one name, whatever the file says", async () => {
    const { actions } = writing();

    await expect(
      adminResourceImportResult({
        actions,
        resource: "products",
        columns: [{ name: "name" }, { name: "name" }],
        rows: "name\r\nfine\r\n",
      }),
    ).rejects.toThrow(/two of the columns/);
  });
});

describe("a row written through the demo's own rule", () => {
  const editor: AdminSession = { email: "editor@demo.helmdeck.dev", role: "editor" };
  const owner: AdminSession = { email: "owner@demo.helmdeck.dev", role: "admin" };

  function seam(session: AdminSession | null) {
    const persistence = createMemoryPersistenceAdapter();
    const actions = createAdminResourceActions({
      guard: createAdminPermissionGuard({ rule: demoCan, session: () => session }),
      persistence,
      expose: exposedResource,
    });
    return { actions, persistence };
  }

  it("is refused for a session that may not create, row by row, with the rule's own words", async () => {
    // Orders are the resource the demo reserves to administrators, so this is the same session and the
    // same resource an export of orders was refused for: one rule, asked by both halves.
    const { actions } = seam(editor);

    const result = await adminResourceImportResult({
      actions,
      resource: "orders",
      columns: [{ name: "customer" }, { name: "status" }],
      rows: "customer,status\nAmber lamp,paid\nBrass light,open\n",
    });

    expect(result.written).toBe(0);
    expect(result.failed).toBe(2);
    expect(result.failures[0].reason).toBe("This session may not orders.create");
    expect(result.failures[1].reason).toBe("This session may not orders.create");
  });

  it("reaches the store for a session that may, and the row is the one the file held", async () => {
    const { actions, persistence } = seam(owner);

    const result = await adminResourceImportResult({
      actions,
      resource: "orders",
      columns: [{ name: "customer" }, { name: "status" }, { name: "total_cents" }],
      rows: "customer,status,total_cents\r\nAmber lamp,paid,4900\r\n",
    });

    expect(result).toMatchObject({ read: 1, written: 1, failed: 0 });
    expect(await persistence.query("orders")).toEqual([
      { id: expect.any(String), customer: "Amber lamp", status: "paid", total_cents: "4900" },
    ]);
  });
});

describe("a file a route hands over", () => {
  it("is read from a stream of bytes, which is what a request body is", async () => {
    // A route reading an upload has a ReadableStream, and turning it into a string first is a server
    // holding whatever was uploaded. The same file either way is the point of one reader.
    const { actions, written } = writing();
    const file = "name,sku\r\nAmber lamp,LAMP-001\r\n";
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const bytes = new TextEncoder().encode(file);
        for (let at = 0; at < bytes.length; at += 3) controller.enqueue(bytes.slice(at, at + 3));
        controller.close();
      },
    });

    const result = await adminResourceImportResult({
      actions,
      resource: "products",
      columns,
      rows: body,
    });

    expect(result.written).toBe(1);
    expect(written[0]).toEqual({ name: "Amber lamp", sku: "LAMP-001", price_cents: null });
  });

  it("hands each row's outcome on the stream, so a caller can act on the first failure as it happens", async () => {
    // The primitive under the aggregate: a caller that wants to show progress, or to stop on the tenth
    // failure of its own, reads the same stream the count is built from.
    const actions = {
      create: async (_resource: string, values: Record<string, unknown>) => {
        if (values.sku === null) throw new Error("no sku");
        return values;
      },
    };
    const seen: string[] = [];
    const rows = adminResourceImport({
      actions,
      resource: "products",
      columns: [{ name: "name" }, { name: "sku" }],
      rows: "name,sku\na,SK-1\nb,\nc,SK-3\n",
    });

    for await (const outcome of rows) {
      seen.push(outcome.kind);
      if (outcome.kind === "written") seen.push(String(outcome.line));
    }

    expect(seen).toEqual(["written", "2", "rejected", "written", "4"]);
  });

  it("counts a run whose file held no rows at all as a run that read nothing", async () => {
    const { actions, written } = writing();

    const result = await adminResourceImportResult({
      actions,
      resource: "products",
      columns,
      rows: "name,sku,price_cents\r\n",
    });

    expect(result).toEqual({
      resource: "products",
      read: 0,
      written: 0,
      failed: 0,
      stopped: false,
      failures: [],
      failuresDropped: 0,
    });
    expect(written).toEqual([]);
  });
});

describe("a refusal from the write boundary", () => {
  it("is reported with what the error said, rather than with the fact that something threw", async () => {
    // A reference that names a row the store does not hold is refused with the field and the value in
    // its message, which is the one piece of it a person can act on. A report saying "write failed"
    // would have thrown that away.
    const create = vi.fn(async () => {
      throw new Error('orders.order_id names "o99", which no orders row carries');
    });

    const result = await adminResourceImportResult({
      actions: { create },
      resource: "orders",
      columns: [{ name: "order_id" }],
      rows: "order_id\no99\n",
    });

    expect(result.failures).toEqual([
      { line: 2, kind: "rejected", reason: 'orders.order_id names "o99", which no orders row carries' },
    ]);
    expect(create).toHaveBeenCalledTimes(1);
  });
});

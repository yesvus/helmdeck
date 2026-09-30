// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  adminCsvRecords,
  adminResourceExport,
  adminResourceExportResponse,
  adminResourceImportResult,
  createAdminPermissionGuard,
  createAdminResourceActions,
  type AdminResourceExport,
  type AdminResourceExportFinished,
  type AdminResourceQuery,
  type AdminSession,
} from "@yesvus/helmdeck";
import { createMemoryPersistenceAdapter } from "../src/baseline/memory";
import { demoCan, exposedResource } from "../fixtures/lib/demo-rules";
import { ensureDemoSeeded } from "../fixtures/lib/ensure-seeded";
import { demoPersistence } from "../fixtures/lib/demo-persistence";
import { seedProducts } from "../fixtures/lib/seed-data";

/**
 * The list a person is looking at, as a file, and that file read back into a store.
 *
 * The pair end to end over the demo's own store and the demo's own rule: the same `demoCan` the
 * products list renders against and the server actions refuse with, the same adapter the demo's suite
 * runs on, and the products the demo seeds. Nothing here stands in for the host, because the
 * properties worth proving are about the seam. A refusal is the seam's refusal, a count is the
 * store's count, and a file that comes back out of the importer is the file that went in.
 */

const owner: AdminSession = { email: "owner@demo.helmdeck.dev", role: "admin" };
const editor: AdminSession = { email: "editor@demo.helmdeck.dev", role: "editor" };

const persistence = demoPersistence().adapter;

type Product = { id: string; name: string; sku: string; price_cents: number; stock: number; note?: string | null };

/**
 * The columns the demo's products definition declares, said again as an export's own columns.
 *
 * A definition's headers are nodes, which a file cannot hold, so a host says the text here. The order
 * and the two format names are the definition's, which is what makes the file and the table beside it
 * agree about what a price is.
 */
const columns = [
  { key: "name", header: "Name" },
  { key: "sku", header: "SKU" },
  { key: "price_cents", header: "Price", format: "money" as const },
  { key: "stock", header: "Stock", format: { name: "count" } },
];

/** With a column for a value the products carry and the table does not draw. */
const withNote = [...columns, { key: "note", header: "Note" }];

function seam(session: AdminSession, store = persistence) {
  return createAdminResourceActions({
    guard: createAdminPermissionGuard({ rule: demoCan, session: () => session }),
    persistence: store,
    expose: exposedResource,
  });
}

/** The file, and what the walk finished with. The finished count is the generator's own return value. */
async function read(file: AdminResourceExport): Promise<{ text: string; finished: AdminResourceExportFinished }> {
  const chunks: string[] = [];
  const rows = file.rows[Symbol.asyncIterator]();
  let step = await rows.next();
  while (!step.done) {
    chunks.push(step.value);
    step = await rows.next();
  }
  return { text: chunks.join(""), finished: step.value };
}

/** The file's own cells, read by the package's reader rather than by a split on commas. */
async function cellsOf(text: string): Promise<string[][]> {
  const found: string[][] = [];
  for await (const record of adminCsvRecords(text)) {
    expect(record.error, `line ${record.line}`).toBeNull();
    found.push(record.cells);
  }
  return found;
}

const lamps: AdminResourceQuery = {
  filter: [{ field: "sku", operator: "contains", value: "LAMP" }],
  sort: [{ field: "sku", direction: "asc" }],
};

async function product(values: Partial<Product> & { id: string }): Promise<void> {
  await persistence.create("products", { name: values.id, sku: values.id, price_cents: 0, stock: 0, ...values });
}

beforeEach(async () => {
  await ensureDemoSeeded();
  // The seed writes its rows back by id, so anything else in the table is a row this file left behind.
  const seeded = new Set(seedProducts.map((row) => row.id));
  for (const row of await persistence.query<{ id: string }>("products")) {
    if (!seeded.has(row.id)) await persistence.delete("products", row.id);
  }
});

describe("a filtered, sorted product list, exported", () => {
  it("is a file of the rows the query matched, in the order the store returned them", async () => {
    const { text, finished } = await read(
      await adminResourceExport({ actions: seam(owner), resource: "products", columns, query: lamps }),
    );

    // Asked of the store through the same contract, so the file is compared against the store's own
    // answer for the same query rather than against a list written out beside it.
    const asked = await persistence.queryPage<Product>("products", lamps);
    const bySku = [...asked.rows].sort((left, right) => (left.sku < right.sku ? -1 : 1));

    // The store's own count, which is what the list beside it shows and what the file holds. The table
    // holds rows the query did not match, which is the difference between a list and a dump.
    expect(await persistence.query("products")).toHaveLength(seedProducts.length);
    expect(finished).toEqual({ exported: asked.total, complete: true });
    expect(await cellsOf(text)).toEqual([
      ["Name", "SKU", "Price", "Stock"],
      ...bySku.map((row) => [row.name, row.sku, `$${(row.price_cents / 100).toFixed(2)}`, String(row.stock)]),
    ]);
  });

  it("is smaller than the table it was read from, which is what a filter is for", async () => {
    const { finished: narrow } = await read(
      await adminResourceExport({ actions: seam(owner), resource: "products", columns, query: lamps }),
    );
    const { finished: whole } = await read(
      await adminResourceExport({ actions: seam(owner), resource: "products", columns }),
    );

    expect(narrow).toEqual({ exported: 2, complete: true });
    expect(whole).toEqual({ exported: seedProducts.length, complete: true });
  });

  it("is nothing at all for a session the rule refuses, and the store is asked for no row of it", async () => {
    // `orders` is the resource the demo reserves to administrators, so this is the export of a list an
    // editor can read the name of and not the contents of. The refusal is the same one a read gets,
    // and it happens before the first window rather than after the file has been started.
    const asked = vi.fn(persistence.queryPage as never);
    const actions = seam(editor, { ...persistence, queryPage: asked } as typeof persistence);

    await expect(
      adminResourceExport({
        actions,
        resource: "orders",
        columns: [{ key: "customer" }, { key: "total_cents", format: "money" }],
      }),
    ).rejects.toThrow("This session may not orders.read");
    expect(asked).not.toHaveBeenCalled();
  });

  it("carries a comma, a quote, a newline, a null and a formula out of the store safely", async () => {
    await product({ id: "prd_comma", name: 'Lamp, "wide"', sku: "LAMP-COMMA" });
    await product({ id: "prd_newline", name: "Lamp\nsecond line", sku: "LAMP-NEWLINE" });
    await product({ id: "prd_formula", name: '=HYPERLINK("http://evil","Statement")', sku: "LAMP-FORMULA" });
    await product({ id: "prd_null", name: "Lamp with nothing", sku: "LAMP-NULL", note: null });

    const { text } = await read(
      await adminResourceExport({ actions: seam(owner), resource: "products", columns: withNote, query: lamps }),
    );

    // The exact file, because each of these is a place a writer and a reader can disagree and only the
    // bytes say which of them is right. The two seeded lamps are in it because their SKUs match the
    // filter too. The newline is inside one cell rather than two rows, the null is an empty cell rather
    // than the word `null`, and the formula is marked so a spreadsheet shows it.
    expect(text).toBe(
      [
        "Name,SKU,Price,Stock,Note",
        "Amber desk lamp,LAMP-001,$49.00,34,",
        "Brass task light,LAMP-002,$125.00,12,",
        '"Lamp, ""wide""",LAMP-COMMA,$0.00,0,',
        '"\'=HYPERLINK(""http://evil"",""Statement"")",LAMP-FORMULA,$0.00,0,',
        '"Lamp\nsecond line",LAMP-NEWLINE,$0.00,0,',
        "Lamp with nothing,LAMP-NULL,$0.00,0,",
        "",
      ].join("\r\n"),
    );
    // And what that file says when a spreadsheet reads it: six rows and a header, the formula among
    // them as a value and not as something to run, and every note empty because a null is one.
    const cells = await cellsOf(text);
    expect(cells).toHaveLength(7);
    expect(cells[4][0]).toBe("'=HYPERLINK(\"http://evil\",\"Statement\")");
    expect(cells.slice(1).every((row) => row[4] === "")).toBe(true);
  });
});

describe("a file read back into a store", () => {
  it("writes the rows the file held, and goes out again as the same file", async () => {
    // The round trip, which is the only test of the pair that says anything about both halves at once.
    // A comma, a quote, a newline, a null and a formula in one go, because each is a place the two
    // halves can disagree and only the whole file shows whether they do.
    await product({ id: "prd_comma", name: 'Lamp, "wide"', sku: "LAMP-COMMA" });
    await product({ id: "prd_newline", name: "Lamp\nsecond line", sku: "LAMP-NEWLINE" });
    await product({ id: "prd_formula", name: '=HYPERLINK("http://evil","Statement")', sku: "LAMP-FORMULA" });
    await product({ id: "prd_quoted", name: '=1+1 and "quoted"', sku: "LAMP-QUOTED" });
    await product({ id: "prd_null", name: "Lamp with nothing", sku: "LAMP-NULL", note: null });

    const first = await read(
      await adminResourceExport({ actions: seam(owner), resource: "products", columns: withNote, query: lamps }),
    );

    // A store of its own, so the import is writing the rows the file named rather than overwriting the
    // ones they came from, and the second export reads what the import stored rather than what the
    // first export formatted.
    const target = createMemoryPersistenceAdapter();
    const actions = seam(owner, target);
    const imported = await adminResourceImportResult({
      actions,
      resource: "products",
      // The file's own headers are the ones a spreadsheet shows, and the record's fields are what the
      // store calls them, so each column says both. The price is the one a file cannot carry: a
      // formatted cell is text, and the parse is what turns "$49.00" back into 4900 cents.
      columns: [
        { header: "Name", name: "name" },
        { header: "SKU", name: "sku" },
        {
          header: "Price",
          name: "price_cents",
          parse: (text) => (text === null ? null : Math.round(Number(text.replace(/[^0-9.]/g, "")) * 100)),
        },
        { header: "Stock", name: "stock", parse: (text) => (text === null ? null : Number(text)) },
        { header: "Note", name: "note" },
      ],
      rows: first.text,
    });

    expect(imported).toEqual({
      resource: "products",
      read: first.finished.exported,
      written: first.finished.exported,
      failed: 0,
      stopped: false,
      failures: [],
      failuresDropped: 0,
    });

    // The values the store now holds are the values the file held: the mark is off the formula, the
    // comma and the quote and the newline are inside the name rather than around it, and the null
    // came back as a null rather than as an empty string.
    const stored = (await target.query<Product>("products")).sort((left, right) =>
      left.sku < right.sku ? -1 : 1,
    );
    expect(stored.map((row) => [row.name, row.note ?? null])).toEqual([
      ["Amber desk lamp", null],
      ["Brass task light", null],
      ['Lamp, "wide"', null],
      ['=HYPERLINK("http://evil","Statement")', null],
      ["Lamp\nsecond line", null],
      ["Lamp with nothing", null],
      ['=1+1 and "quoted"', null],
    ]);

    const second = await read(
      await adminResourceExport({ actions, resource: "products", columns: withNote, query: lamps }),
    );

    expect(second.finished).toEqual({ exported: first.finished.exported, complete: true });
    // Byte for byte. A pair that agreed about the values but not about the file would still be a pair
    // whose second export is a different file, and a partner integrating a file weekly would see it.
    expect(second.text).toBe(first.text);
  });

  it("reaches the store a row at a time, so a thousand rows and one row are the same importer", async () => {
    const rows = Array.from({ length: 1000 }, (_, index) => `Product ${index},SKU-${index},1,1,`);
    const target = createMemoryPersistenceAdapter();
    const actions = seam(owner, target);

    const many = await adminResourceImportResult({
      actions,
      resource: "products",
      columns: [{ name: "name" }, { name: "sku" }, { name: "price_cents" }, { name: "stock" }, { name: "note" }],
      rows: ["name,sku,price_cents,stock,note", ...rows].join("\n"),
    });
    const one = await adminResourceImportResult({
      actions,
      resource: "products",
      columns: [{ name: "name" }, { name: "sku" }, { name: "price_cents" }, { name: "stock" }, { name: "note" }],
      rows: "name,sku,price_cents,stock,note\nProduct 500,SKU-500,1,1,\n",
    });

    expect(many).toMatchObject({ read: 1000, written: 1000, failed: 0, stopped: false });
    // The same row, in the same store, written by the same importer: which is the requirement the issue
    // states, and which an importer that validated in batches would only get right for one of them.
    expect((await target.query<Product>("products")).some((row) => row.sku === "SKU-500")).toBe(true);
    expect(one).toMatchObject({ read: 1, written: 1, failed: 0 });
  });
});

describe("a file offered for download", () => {
  it("is a response the route can return, holding the same file", async () => {
    const response = await adminResourceExportResponse({
      actions: seam(owner),
      resource: "products",
      filename: "products.csv",
      columns,
      query: lamps,
    });

    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="products.csv"');
    const body = await response.text();
    // A header, two rows and the break after the last one.
    expect(body.split("\r\n")).toHaveLength(4);
    expect(await cellsOf(body)).toEqual([
      ["Name", "SKU", "Price", "Stock"],
      ["Amber desk lamp", "LAMP-001", "$49.00", "34"],
      ["Brass task light", "LAMP-002", "$125.00", "12"],
    ]);
  });
});

-- SPDX-License-Identifier: MIT
--
-- The demo's customers and the shipments that go out to them.
--
-- Two resources that point at each other, which is the shape a table browser had no vocabulary for
-- until `reference` was one. `shipments.customer_id` names a `customers` row, and
-- `shipments.order_id` names an `orders` row, which an editor may not read: a reference is checked
-- by reading the row it names, so a column pointing at a resource the session is refused is a
-- column the session can neither choose from nor write.
--
-- `customers.parent_id` names another `customers` row, which is a cycle the generated views have to
-- terminate. They do, by asking one hop: a cell prints the parent's name and never looks at the
-- parent's parent. The constraint is declared as a real foreign key rather than left to the
-- application, because a constraint this file does not declare is a comment.
--
-- `ON DELETE SET NULL` on both self references, because a row whose parent is deleted keeps its own
-- identity. A cascade would take the child with it, and a demo that deletes one customer should not
-- delete a queue of shipments.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  tier TEXT NOT NULL DEFAULT 'standard' CHECK (tier IN ('standard', 'trade', 'key')),
  parent_id TEXT REFERENCES customers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS customers_parent_idx ON customers (parent_id);

CREATE TABLE IF NOT EXISTS shipments (
  id TEXT PRIMARY KEY,
  -- The tracking code a person reads, rather than the row's id.
  tracking TEXT NOT NULL CHECK (length(trim(tracking)) > 0),
  status TEXT NOT NULL DEFAULT 'label_created'
    CHECK (status IN ('label_created', 'in_transit', 'delivered')),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  -- Nullable, and pointing at a resource an editor is refused, which is the case that turns a
  -- convenience into a leak if the choices were drawn without asking.
  order_id TEXT REFERENCES orders(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS shipments_customer_idx ON shipments (customer_id);
CREATE INDEX IF NOT EXISTS shipments_order_idx ON shipments (order_id);

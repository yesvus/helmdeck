// SPDX-License-Identifier: MIT
import { test } from "node:test";
import assert from "node:assert/strict";
import { check, removedNames } from "./exported-surface.mjs";

test("an unchanged surface passes", () => {
  const result = check({ previous: ["a", "b"], current: ["a", "b"], version: "0.4.0" });
  assert.equal(result.fails, false);
  assert.deepEqual(result.removals, []);
});

test("additions pass, because adding is what a minor is for", () => {
  const result = check({ previous: ["a"], current: ["a", "b", "c"], version: "0.5.0" });
  assert.equal(result.fails, false);
});

test("a removal fails below 1.0, and says why that is stricter than semver", () => {
  const result = check({ previous: ["a", "b"], current: ["a"], version: "0.5.0" });
  assert.equal(result.fails, true);
  assert.deepEqual(result.removals, ["b"]);
  assert.match(result.reason, /cut a major/);
  assert.match(result.reason, /below 1\.0/);
});

test("a removal fails at 1.0 too", () => {
  const result = check({ previous: ["a", "b"], current: ["a"], version: "1.2.0" });
  assert.equal(result.fails, true);
  assert.match(result.reason, /Restore the name, or cut a major\.$/);
});

test("the failure names every removed export, not a count", () => {
  const result = check({ previous: ["a", "b", "c"], current: ["a"], version: "0.5.0" });
  assert.match(result.reason, /b, c/);
});

test("removedNames compares by identity, not by position", () => {
  // A reordering is not a removal. A test that compared arrays would fail on a sorted list whose
  // order changed, which is the kind of false alarm that trains people to ignore a gate.
  assert.deepEqual(removedNames(["a", "b", "c"], ["c", "b", "a"]), []);
  assert.deepEqual(removedNames(["a", "b"], ["b", "a"]), []);
});

test("removals are reported in the order the baseline declared them", () => {
  assert.deepEqual(removedNames(["z", "y", "x"], ["x"]), ["z", "y"]);
});

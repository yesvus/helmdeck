// SPDX-License-Identifier: MIT
import { test } from "node:test";
import assert from "node:assert/strict";
import { assertFloorMatchesTypes, nodeFloor, nodeTypesMajor } from "./node-floor.mjs";

test("the pinned runtime is read out of a bare or a v-prefixed line", () => {
  assert.equal(nodeFloor("22\n"), "22");
  assert.equal(nodeFloor("v26.11.1\n"), "26");
  assert.equal(nodeFloor("24"), "24");
});

test("a .nvmrc naming no version refuses rather than reading one out of the noise", () => {
  assert.throws(() => nodeFloor("lts/*\n"), /does not hold a version/);
  assert.throws(() => nodeFloor(""), /does not hold a version/);
});

test("the major is read out of the declared @types/node range", () => {
  assert.equal(nodeTypesMajor("^26"), "26");
  assert.equal(nodeTypesMajor("^22.20.4"), "22");
  assert.equal(nodeTypesMajor("~24.1.0"), "24");
});

test("a range whose major cannot be read refuses, because a guess here is the drift it looks for", () => {
  assert.throws(() => nodeTypesMajor("latest"), /major range/);
  assert.throws(() => nodeTypesMajor("workspace:*"), /major range/);
});

test("matching declarations pass and still name the fact they verified", () => {
  assert.match(assertFloorMatchesTypes({ floor: "24", types: "24", range: "^24" }), /Node 24/);
  assert.match(assertFloorMatchesTypes({ floor: "22", types: "22", range: "^22" }), /@types\/node \^22/);
});

// The cases below are the reason this module exists. A check that has only ever seen matching values has
// not been shown to notice a mismatch, and the mismatch was proposed as a pull request and refused by
// memory. If these stop failing, the check is decorative.
test("types describing a newer Node than the gate runs fail", () => {
  assert.throws(
    () => assertFloorMatchesTypes({ floor: "22", types: "26", range: "^26" }),
    /describes a Node newer than the gate runs/,
  );
});

test("types describing an older Node fail too, because stale types are the same drift", () => {
  assert.throws(
    () => assertFloorMatchesTypes({ floor: "26", types: "22", range: "^22" }),
    /older than the gate runs/,
  );
});

test("the failure says which of the two to change, so it is actionable without reading the source", () => {
  let message = "";
  try {
    assertFloorMatchesTypes({ floor: "22", types: "26", range: "^26" });
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  assert.match(message, /\.nvmrc to the runtime/);
  assert.match(message, /@types\/node to \^22/);
});
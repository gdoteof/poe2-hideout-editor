// Unit tests for the pure hideout editing engine.
// Run with: node test/edit.mjs

import assert from "node:assert/strict";
import {
  moveDoodad,
  setPosition,
  rotateDoodad,
  flipDoodad,
  setVariation,
  deleteDoodad,
  addDoodad,
  cloneDoodad,
  History,
} from "../src/edit.mjs";
import { rToDegrees, fvVariation, fvFlipped, makeFv } from "../src/hideout.mjs";

let cases = 0;
function test(name, fn) {
  cases++;
  fn();
}

// A sample fixture. Note `hex` is an EXTRA field that must be preserved.
function fixture() {
  return [
    { name: "a", hash: 1, x: 10, y: 20, r: 0, fv: makeFv(3, false), hex: "aa" },
    { name: "b", hash: 2, x: 30, y: 40, r: 16384, fv: makeFv(5, true) },
    { name: "c", hash: 3, x: 50, y: 60, r: 32768, fv: makeFv(0, false) },
  ];
}

// --- moveDoodad ---
test("moveDoodad offsets and rounds", () => {
  const d = fixture();
  const out = moveDoodad(d, 0, 5.4, -3.6);
  assert.equal(out[0].x, 15); // 10 + 5.4 -> 15
  assert.equal(out[0].y, 16); // 20 - 3.6 -> 16
});

// --- setPosition ---
test("setPosition sets and rounds", () => {
  const d = fixture();
  const out = setPosition(d, 1, 100.6, 200.2);
  assert.equal(out[1].x, 101);
  assert.equal(out[1].y, 200);
});

// --- rotateDoodad ---
test("rotate by 90 degrees changes r", () => {
  const d = fixture();
  const out = rotateDoodad(d, 0, 90);
  assert.ok(Math.abs(rToDegrees(out[0].r) - 90) < 0.01);
});

test("rotate 4x90 = identity", () => {
  let d = fixture();
  const orig = d[0].r;
  for (let i = 0; i < 4; i++) d = rotateDoodad(d, 0, 90);
  assert.equal(d[0].r, orig);
});

test("rotate wraps past 360", () => {
  let d = fixture();
  const a = rotateDoodad(d, 0, 450); // 450 % 360 = 90
  const b = rotateDoodad(d, 0, 90);
  assert.equal(a[0].r, b[0].r);
});

// --- flipDoodad ---
test("flip toggles flip bit, preserves variation", () => {
  const d = fixture();
  const before = d[0].fv;
  const out = flipDoodad(d, 0);
  assert.equal(fvFlipped(out[0].fv), !fvFlipped(before));
  assert.equal(fvVariation(out[0].fv), fvVariation(before));
});

test("flip twice = identity", () => {
  const d = fixture();
  const out = flipDoodad(flipDoodad(d, 0), 0);
  assert.equal(out[0].fv, d[0].fv);
});

// --- setVariation ---
test("setVariation sets variation, preserves flip", () => {
  const d = fixture();
  const wasFlipped = fvFlipped(d[1].fv); // b is flipped
  const out = setVariation(d, 1, 9);
  assert.equal(fvVariation(out[1].fv), 9);
  assert.equal(fvFlipped(out[1].fv), wasFlipped);
});

// --- deleteDoodad ---
test("delete removes the right entry", () => {
  const d = fixture();
  const out = deleteDoodad(d, 1);
  assert.equal(out.length, d.length - 1);
  assert.deepEqual(out.map((x) => x.name), ["a", "c"]);
});

// --- addDoodad ---
test("add appends a doodad", () => {
  const d = fixture();
  const nd = { name: "z", hash: 9, x: 1, y: 2, r: 0, fv: 0 };
  const out = addDoodad(d, nd);
  assert.equal(out.length, d.length + 1);
  assert.equal(out[out.length - 1].name, "z");
});

// --- cloneDoodad ---
test("clone appends offset copy, original unchanged", () => {
  const d = fixture();
  const out = cloneDoodad(d, 0, 5, 7);
  assert.equal(out.length, d.length + 1);
  const copy = out[out.length - 1];
  assert.equal(copy.name, "a");
  assert.equal(copy.x, 15); // 10 + 5
  assert.equal(copy.y, 27); // 20 + 7
  assert.equal(d[0].x, 10); // original untouched
});

test("clone preserves extra fields (hex)", () => {
  const d = fixture();
  const out = cloneDoodad(d, 0);
  assert.equal(out[out.length - 1].hex, "aa");
});

// --- Immutability ---
test("ops do not mutate original array or entries", () => {
  const d = fixture();
  const snapshot = JSON.parse(JSON.stringify(d));
  moveDoodad(d, 0, 5, 5);
  setPosition(d, 0, 1, 1);
  rotateDoodad(d, 0, 90);
  flipDoodad(d, 0);
  setVariation(d, 0, 7);
  deleteDoodad(d, 0);
  addDoodad(d, { name: "z", hash: 9, x: 0, y: 0, r: 0, fv: 0 });
  cloneDoodad(d, 0, 1, 1);
  assert.deepEqual(d, snapshot); // array + entries unchanged
});

test("changed entry is a new object, others by reference", () => {
  const d = fixture();
  const out = moveDoodad(d, 0, 1, 1);
  assert.notEqual(out[0], d[0]); // changed entry replaced
  assert.equal(out[1], d[1]); // untouched entries shared
  assert.notEqual(out, d); // new array
});

test("extra fields preserved through edits", () => {
  const d = fixture();
  const out = rotateDoodad(moveDoodad(d, 0, 1, 1), 0, 45);
  assert.equal(out[0].hex, "aa");
});

// --- Index guard: throws RangeError ---
test("out-of-range index throws RangeError", () => {
  const d = fixture();
  assert.throws(() => moveDoodad(d, 99, 1, 1), RangeError);
  assert.throws(() => moveDoodad(d, -1, 1, 1), RangeError);
  assert.throws(() => deleteDoodad(d, 99), RangeError);
  assert.throws(() => cloneDoodad(d, 99), RangeError);
});

// --- History ---
test("History undo/redo sequence", () => {
  const s0 = fixture();
  const h = new History(s0);
  assert.equal(h.current, s0);
  assert.equal(h.canUndo(), false);
  assert.equal(h.canRedo(), false);

  const s1 = moveDoodad(s0, 0, 1, 0);
  h.push(s1);
  const s2 = moveDoodad(s1, 0, 1, 0);
  h.push(s2);
  const s3 = moveDoodad(s2, 0, 1, 0);
  h.push(s3);
  assert.equal(h.current, s3);
  assert.equal(h.canUndo(), true);
  assert.equal(h.canRedo(), false);

  // undo twice -> back at s1
  assert.equal(h.undo(), s2);
  assert.equal(h.undo(), s1);
  assert.equal(h.canRedo(), true);

  // redo once -> s2
  assert.equal(h.redo(), s2);

  // push truncates redo tail (s3 discarded)
  const s2b = flipDoodad(s2, 0);
  h.push(s2b);
  assert.equal(h.current, s2b);
  assert.equal(h.canRedo(), false); // redo tail gone
  assert.equal(h.redo(), s2b); // no-op, stays put

  // undo all the way back to initial (states are [s0, s1, s2, s2b])
  h.undo();
  h.undo();
  h.undo();
  assert.equal(h.current, s0);
  assert.equal(h.canUndo(), false);
  assert.equal(h.undo(), s0); // undo at start is a no-op
});

test("History caps at limit and keeps newest", () => {
  const h = new History([], { limit: 3 });
  for (let i = 1; i <= 5; i++) h.push([{ tag: i }]);
  // Newest state should be i=5.
  assert.equal(h.current[0].tag, 5);
  // With limit 3 we can undo at most twice before hitting the oldest kept.
  assert.equal(h.undo()[0].tag, 4);
  assert.equal(h.undo()[0].tag, 3);
  assert.equal(h.canUndo(), false);
});

console.log(`edit.mjs: all ${cases} test cases passed`);

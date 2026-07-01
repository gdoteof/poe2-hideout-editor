import assert from "node:assert/strict";
import {
  pointInPolygon,
  boundingBox,
  boundsCenter,
  rectToPolygon,
  clampToBox,
  countInside,
} from "../src/bounds.mjs";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (err) {
    failed++;
    console.error(`FAIL: ${name}`);
    console.error(`  ${err.message}`);
  }
}

// --- pointInPolygon: simple square ---
const square = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
];

test("pointInPolygon: center of square is inside", () => {
  assert.equal(pointInPolygon(5, 5, square), true);
});

test("pointInPolygon: point far outside square", () => {
  assert.equal(pointInPolygon(20, 20, square), false);
  assert.equal(pointInPolygon(-5, 5, square), false);
  assert.equal(pointInPolygon(5, -5, square), false);
});

// --- pointInPolygon: concave (L-shaped) polygon ---
// An L shape occupying the region minus the top-right notch:
//   (0,0)->(10,0)->(10,4)->(4,4)->(4,10)->(0,10)
// The notch is the square x in [4,10], y in [4,10] (excluding filled part).
const lShape = [
  [0, 0],
  [10, 0],
  [10, 4],
  [4, 4],
  [4, 10],
  [0, 10],
];

test("pointInPolygon: L-shape point in solid arm is inside", () => {
  assert.equal(pointInPolygon(2, 8, lShape), true); // left arm
  assert.equal(pointInPolygon(8, 2, lShape), true); // bottom arm
  assert.equal(pointInPolygon(2, 2, lShape), true); // corner
});

test("pointInPolygon: L-shape point in the notch is outside", () => {
  // (7,7) sits in the removed top-right notch -> must be outside
  assert.equal(pointInPolygon(7, 7, lShape), false);
});

// --- pointInPolygon: degenerate polygons ---
test("pointInPolygon: fewer than 3 points returns false", () => {
  assert.equal(pointInPolygon(0, 0, []), false);
  assert.equal(pointInPolygon(0, 0, [[0, 0]]), false);
  assert.equal(pointInPolygon(0, 0, [[0, 0], [1, 1]]), false);
  assert.equal(pointInPolygon(0, 0, null), false);
});

// --- boundingBox ---
test("boundingBox: square", () => {
  assert.deepEqual(boundingBox(square), {
    minX: 0,
    minY: 0,
    maxX: 10,
    maxY: 10,
  });
});

test("boundingBox: irregular polygon", () => {
  const poly = [
    [-3, 2],
    [4, -1],
    [7, 5],
    [1, 9],
  ];
  assert.deepEqual(boundingBox(poly), {
    minX: -3,
    minY: -1,
    maxX: 7,
    maxY: 9,
  });
});

test("boundingBox: empty/invalid returns null", () => {
  assert.equal(boundingBox([]), null);
  assert.equal(boundingBox(null), null);
});

// --- boundsCenter (rounding) ---
test("boundsCenter: even square", () => {
  assert.deepEqual(boundsCenter(square), { x: 5, y: 5 });
});

test("boundsCenter: rounds to integers", () => {
  // box 0..5, 0..5 -> center 2.5,2.5 -> rounds to 3,3
  const poly = [
    [0, 0],
    [5, 0],
    [5, 5],
    [0, 5],
  ];
  assert.deepEqual(boundsCenter(poly), { x: 3, y: 3 });
});

test("boundsCenter: null poly returns null", () => {
  assert.equal(boundsCenter([]), null);
});

// --- rectToPolygon round-trips through boundingBox ---
test("rectToPolygon: shape and round-trip", () => {
  const rect = { minX: 2, minY: 3, maxX: 8, maxY: 9 };
  assert.deepEqual(rectToPolygon(rect), [
    [2, 3],
    [8, 3],
    [8, 9],
    [2, 9],
  ]);
  assert.deepEqual(boundingBox(rectToPolygon(rect)), rect);
});

// --- clampToBox ---
const box = { minX: 0, minY: 0, maxX: 10, maxY: 10 };

test("clampToBox: inside point unchanged", () => {
  assert.deepEqual(clampToBox(5, 5, box), { x: 5, y: 5 });
});

test("clampToBox: clamps each side", () => {
  assert.deepEqual(clampToBox(-5, 5, box), { x: 0, y: 5 }); // left
  assert.deepEqual(clampToBox(15, 5, box), { x: 10, y: 5 }); // right
  assert.deepEqual(clampToBox(5, -5, box), { x: 5, y: 0 }); // bottom
  assert.deepEqual(clampToBox(5, 15, box), { x: 5, y: 10 }); // top
  assert.deepEqual(clampToBox(-5, 15, box), { x: 0, y: 10 }); // corner
});

test("clampToBox: rounds to integers", () => {
  assert.deepEqual(clampToBox(3.4, 6.6, box), { x: 3, y: 7 });
});

// --- countInside ---
test("countInside: mix of inside and outside points", () => {
  const points = [
    { x: 5, y: 5 }, // in
    { x: 1, y: 1 }, // in
    { x: 20, y: 20 }, // out
    { x: -1, y: 5 }, // out
    { x: 9, y: 9 }, // in
  ];
  assert.equal(countInside(points, square), 3);
});

test("countInside: L-shape excludes notch points", () => {
  const points = [
    { x: 2, y: 8 }, // in (left arm)
    { x: 7, y: 7 }, // out (notch)
    { x: 8, y: 2 }, // in (bottom arm)
  ];
  assert.equal(countInside(points, lShape), 2);
});

test("countInside: invalid inputs return 0", () => {
  assert.equal(countInside([], square), 0);
  assert.equal(countInside(null, square), 0);
  assert.equal(countInside([{ x: 5, y: 5 }], []), 0);
});

const total = passed + failed;
console.log(`bounds tests: ${passed}/${total} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

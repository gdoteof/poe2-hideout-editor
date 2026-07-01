// Pure, dependency-free geometry helpers for hideout buildable-area bounds.
//
// A buildable region is a polygon: an array of [x, y] vertex pairs forming an
// open ring (the closing edge from the last vertex back to the first is
// implied). Coordinates are in the same space as decoration x,y.

/**
 * Ray-casting point-in-polygon test.
 *
 * @param {number} x
 * @param {number} y
 * @param {[number, number][]} poly open ring of [x, y] vertices
 * @returns {boolean} true if (x, y) is inside the polygon
 *
 * On-edge convention: points lying exactly on an edge or vertex are NOT
 * guaranteed to return a particular value — the classic crossing-number
 * algorithm used here is only consistent for the half-open edge rule it
 * implements (a vertex at exactly y is counted for its lower endpoint only).
 * Callers must not rely on boundary points; they may return either true or
 * false. Polygons with fewer than 3 vertices always return false.
 */
export function pointInPolygon(x, y, poly) {
  if (!poly || poly.length < 3) return false;
  let inside = false;
  const n = poly.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    // Does the horizontal ray from (x, y) cross edge (j -> i)?
    const intersects =
      (yi > y) !== (yj > y) &&
      x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/**
 * Axis-aligned bounding box of a polygon.
 *
 * @param {[number, number][]} poly
 * @returns {{minX:number,minY:number,maxX:number,maxY:number}|null}
 *   null for an empty/invalid poly.
 */
export function boundingBox(poly) {
  if (!poly || poly.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < poly.length; i++) {
    const px = poly[i][0], py = poly[i][1];
    if (px < minX) minX = px;
    if (py < minY) minY = py;
    if (px > maxX) maxX = px;
    if (py > maxY) maxY = py;
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Center of a polygon's bounding box, rounded to integers.
 *
 * @param {[number, number][]} poly
 * @returns {{x:number,y:number}|null}
 */
export function boundsCenter(poly) {
  const box = boundingBox(poly);
  if (!box) return null;
  return {
    x: Math.round((box.minX + box.maxX) / 2),
    y: Math.round((box.minY + box.maxY) / 2),
  };
}

/**
 * Convert a box to a closed-corner polygon ring.
 *
 * @param {{minX:number,minY:number,maxX:number,maxY:number}} rect
 * @returns {[number, number][]}
 */
export function rectToPolygon(rect) {
  const { minX, minY, maxX, maxY } = rect;
  return [
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY],
  ];
}

/**
 * Clamp a point into a box, rounding to integers.
 *
 * @param {number} x
 * @param {number} y
 * @param {{minX:number,minY:number,maxX:number,maxY:number}} box
 * @returns {{x:number,y:number}}
 */
export function clampToBox(x, y, box) {
  let cx = x < box.minX ? box.minX : x > box.maxX ? box.maxX : x;
  let cy = y < box.minY ? box.minY : y > box.maxY ? box.maxY : y;
  return { x: Math.round(cx), y: Math.round(cy) };
}

/**
 * Count how many points fall inside the polygon.
 *
 * @param {{x:number,y:number}[]} points
 * @param {[number, number][]} poly
 * @returns {number}
 */
export function countInside(points, poly) {
  if (!points || !poly || poly.length < 3) return 0;
  let count = 0;
  for (let i = 0; i < points.length; i++) {
    if (pointInPolygon(points[i].x, points[i].y, poly)) count++;
  }
  return count;
}

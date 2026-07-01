// Mosaic engine tests on synthetic images (no image decoder needed).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mosaicFromImage } from "../src/mosaic.mjs";
import { serializeHideout, parseHideout } from "../src/hideout.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const palette = JSON.parse(readFileSync(join(here, "..", "data", "palette.json"))).colors;

let fail = 0;
const ok = (cond, msg) => { if (!cond) { fail++; console.log(`  FAIL ${msg}`); } else console.log(`  ok   ${msg}`); };

// Build an RGBA image from a per-pixel fn returning [r,g,b,a].
function make(width, height, fn) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const [r, g, b, a] = fn(x, y);
    const i = (y * width + x) * 4;
    data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a;
  }
  return { data, width, height };
}

// --- ink mode: black plus-sign on white -> traces the lines, skips white ---
{
  const W = 40, H = 40;
  const img = make(W, H, (x, y) => {
    const online = Math.abs(x - 20) < 3 || Math.abs(y - 20) < 3;
    return online ? [0, 0, 0, 255] : [255, 255, 255, 255];
  });
  const res = mosaicFromImage(img, palette, { mode: "ink", cols: 20, inkThreshold: 128, inkCoverage: 0.2 });
  ok(res.used > 0 && res.used < res.scanned, `ink places some, not all (${res.used}/${res.scanned})`);
  const inkHex = palette.reduce((a, b) => a).hex; // darkest-ish; just assert uniform
  ok(new Set(res.placements.map((p) => p.hash)).size === 1, "ink uses a single decoration");
  // center row/col should be populated, corners empty
  const at = (cx, cy) => res.placements.some((p) => Math.abs(p.x - cx * 2) < 1 && Math.abs(p.y - cy * 2) < 1);
  ok(at(10, 10), "ink fills center crossing");
}

// --- color mode: solid red field -> nearest palette color, transparent skipped ---
{
  const img = make(20, 20, (x, y) => (y < 10 ? [230, 40, 40, 255] : [0, 0, 0, 0]));
  const res = mosaicFromImage(img, palette, { mode: "color", cols: 10, alphaThreshold: 128 });
  ok(res.used > 0, "color places on opaque region");
  ok(res.placements.every((p) => p.y < 10 * 2 + 1), "color skips transparent half");
}

// --- duplicate-key export survives round-trip ---
{
  const img = make(30, 30, (x, y) => (Math.abs(x - 15) < 4 ? [0, 0, 0, 255] : [255, 255, 255, 255]));
  const res = mosaicFromImage(img, palette, { mode: "ink", cols: 15, step: 2 });
  const model = {
    version: 1, language: "English", hideout_name: "Test", hideout_hash: 1,
    doodads: res.placements.map(({ name, hash, x, y, r, fv }) => ({ name, hash, x, y, r, fv })),
  };
  const text = serializeHideout(model, { bom: true });
  const back = parseHideout(text);
  ok(back.doodads.length === res.used, `all ${res.used} dup-key doodads survive (got ${back.doodads.length})`);
}

console.log(fail ? `\nMOSAIC: ${fail} failed` : "\nMOSAIC: all passed");
process.exit(fail ? 1 : 0);

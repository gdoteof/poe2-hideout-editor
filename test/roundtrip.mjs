// Proves the core is lossless: every sample must parse -> serialize back to
// byte-identical output. Also spot-checks field-decode helpers.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  parseHideout,
  serializeHideout,
  rToDegrees,
  degreesToR,
  fvVariation,
  fvFlipped,
  makeFv,
} from "../src/hideout.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const samplesRoot = join(here, "..", "data", "samples");

let pass = 0,
  fail = 0;

for (const game of ["poe1", "poe2"]) {
  const dir = join(samplesRoot, game);
  console.log(`[${game}]`);
  for (const name of readdirSync(dir).filter((f) => f.endsWith(".hideout"))) {
    const original = readFileSync(join(dir, name), "utf8");
    const model = parseHideout(original);
    const out = serializeHideout(model, { bom: model._hadBom });
    if (out === original) {
      pass++;
      console.log(`  ok   ${name}  (${model.doodads.length} doodads)`);
    } else {
      fail++;
      console.log(`  FAIL ${name}`);
      // find first divergence
      let k = 0;
      while (k < Math.min(out.length, original.length) && out[k] === original[k]) k++;
      console.log(`       diverges at ${k}: exp ${JSON.stringify(original.slice(k, k + 40))}`);
      console.log(`                       got ${JSON.stringify(out.slice(k, k + 40))}`);
      console.log(`       lengths: original=${original.length} got=${out.length}`);
    }
  }
}

// helper sanity checks
const approx = (a, b) => Math.abs(a - b) < 1e-6;
console.assert(approx(rToDegrees(0), 0), "r 0");
console.assert(approx(rToDegrees(32768), 180), "r 180");
console.assert(degreesToR(180) === 32768, "deg 180");
console.assert(degreesToR(360) === 0, "deg 360 wraps");
console.assert(fvVariation(133) === 5 && fvFlipped(133) === true, "fv 133");
console.assert(makeFv(5, true) === 133, "makeFv 133");
console.assert(makeFv(2, false) === 2, "makeFv 2");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

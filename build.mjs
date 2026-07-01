// Assemble a self-contained static site in dist/ for Cloudflare Pages.
// The dev app (web/) imports ../src and ../data; here we flatten those paths so
// index.html can be served from the site root.
import { mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync } from "node:fs";

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist/assets", { recursive: true });
mkdirSync("dist/data", { recursive: true });

// index.html + assets are already root-relative (./app.mjs, ./assets/...)
copyFileSync("web/index.html", "dist/index.html");
copyFileSync("web/assets/dickbutt.jpg", "dist/assets/dickbutt.jpg");
copyFileSync("src/hideout.mjs", "dist/hideout.mjs");
copyFileSync("src/mosaic.mjs", "dist/mosaic.mjs");
copyFileSync("src/edit.mjs", "dist/edit.mjs");
copyFileSync("data/palette.json", "dist/data/palette.json");
copyFileSync("data/palette.poe1.json", "dist/data/palette.poe1.json");
copyFileSync("data/hideout-base-catalog.json", "dist/data/hideout-base-catalog.json");

// preview.mjs imports ../src/hideout.mjs -> ./hideout.mjs in the flat layout
const preview = readFileSync("web/preview.mjs", "utf8")
  .replace("../src/hideout.mjs", "./hideout.mjs");
writeFileSync("dist/preview.mjs", preview);

// rewrite app.mjs import/fetch paths for the flattened layout
const app = readFileSync("web/app.mjs", "utf8")
  .replace("../src/hideout.mjs", "./hideout.mjs")
  .replace("../src/mosaic.mjs", "./mosaic.mjs")
  .replace("../src/edit.mjs", "./edit.mjs")
  .replace("../data/palette.json", "./data/palette.json")
  .replace("../data/palette.poe1.json", "./data/palette.poe1.json")
  .replace("../data/hideout-base-catalog.json", "./data/hideout-base-catalog.json");
writeFileSync("dist/app.mjs", app);

console.log("built dist/");

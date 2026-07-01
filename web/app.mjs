import { parseHideout, serializeHideout } from "../src/hideout.mjs";
import { mosaicFromImage } from "../src/mosaic.mjs";

const cv = document.getElementById("cv");
const ctx = cv.getContext("2d");
const tip = document.getElementById("tip");
const $ = (id) => document.getElementById(id);

// Default base to place a from-scratch mosaic into (The Dreadnought — large).
const DEFAULT_BASE = { hideout_name: "The Dreadnought Hideout", hideout_hash: 30315 };
const MOSAIC_ORIGIN = { x: 380, y: 260 };

let model = null;
let originalName = "mosaic.hideout";
let palette = [];
let srcImage = null; // { data, width, height }
const view = { scale: 1, cx: 0, cy: 0 };

const hashHue = (h) => h % 360;
const doodadColor = (d) => d.hex || `hsl(${hashHue(d.hash)} 65% 60%)`;

// ---------- rendering ----------
function fitView() {
  if (!model || !model.doodads.length) return;
  const xs = model.doodads.map((d) => d.x), ys = model.doodads.map((d) => d.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  view.cx = (minX + maxX) / 2;
  view.cy = (minY + maxY) / 2;
  const pad = 40;
  view.scale = Math.min(
    (cv.width - pad * 2) / Math.max(1, maxX - minX),
    (cv.height - pad * 2) / Math.max(1, maxY - minY),
  );
}
const worldToScreen = (x, y) => [
  (x - view.cx) * view.scale + cv.width / 2,
  (y - view.cy) * view.scale + cv.height / 2,
];
const screenToWorld = (sx, sy) => [
  (sx - cv.width / 2) / view.scale + view.cx,
  (sy - cv.height / 2) / view.scale + view.cy,
];

function resize() {
  const r = cv.parentElement.getBoundingClientRect();
  cv.width = Math.floor(r.width);
  cv.height = Math.floor(r.height);
  draw();
}
function draw() {
  // neutral "floor" so decorations of any color read against it
  ctx.fillStyle = "#9aa0a8";
  ctx.fillRect(0, 0, cv.width, cv.height);
  if (!model) return;
  const cell = model._cell; // grid step (mosaics) -> draw connected squares
  if (cell) {
    const s = Math.max(1, cell * view.scale);
    for (const d of model.doodads) {
      const [sx, sy] = worldToScreen(d.x, d.y);
      if (sx < -s || sy < -s || sx > cv.width + s || sy > cv.height + s) continue;
      ctx.fillStyle = doodadColor(d);
      ctx.fillRect(sx - s / 2, sy - s / 2, s + 0.6, s + 0.6);
    }
  } else {
    const rad = Math.max(1.5, Math.min(7, view.scale * 0.55));
    for (const d of model.doodads) {
      const [sx, sy] = worldToScreen(d.x, d.y);
      if (sx < -10 || sy < -10 || sx > cv.width + 10 || sy > cv.height + 10) continue;
      ctx.beginPath();
      ctx.arc(sx, sy, rad, 0, Math.PI * 2);
      ctx.fillStyle = doodadColor(d);
      ctx.fill();
    }
  }
}
function updateStats() {
  const d = model.doodads;
  const xs = d.map((o) => o.x), ys = d.map((o) => o.y);
  $("s-base").textContent = model.hideout_name ?? "—";
  $("s-hash").textContent = model.hideout_hash ?? "—";
  $("s-count").textContent = d.length;
  $("s-unique").textContent = new Set(d.map((o) => o.hash)).size;
  $("s-x").textContent = d.length ? `${Math.min(...xs)}–${Math.max(...xs)}` : "—";
  $("s-y").textContent = d.length ? `${Math.min(...ys)}–${Math.max(...ys)}` : "—";
}

// ---------- data loading ----------
async function loadPalette() {
  const res = await fetch("../data/palette.json");
  palette = (await res.json()).colors;
}
function imageDataFrom(img, maxW = 500) {
  const scale = Math.min(1, maxW / img.naturalWidth);
  const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, 0, 0, w, h);
  const { data } = g.getImageData(0, 0, w, h);
  return { data, width: w, height: h };
}
function loadImageEl(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// ---------- mosaic ----------
function generate() {
  if (!srcImage || !palette.length) return;
  const mode = $("m-mode").value;
  const cols = +$("m-cols").value;
  const res = mosaicFromImage(srcImage, palette, {
    mode, cols, step: 2, origin: MOSAIC_ORIGIN,
    inkThreshold: +$("m-ink").value, inkCoverage: 0.16,
    bgHex: "#ffffff", bgTolerance: 16,
  });
  const base = model ?? DEFAULT_BASE;
  model = {
    version: 1, language: "English",
    hideout_name: base.hideout_name, hideout_hash: base.hideout_hash,
    doodads: res.placements.map(({ name, hash, x, y, r, fv, hex }) => ({ name, hash, x, y, r, fv, hex })),
    _hadBom: true,
    _cell: res.step,
  };
  $("m-info").textContent = `${res.used} decorations · ${res.cols}×${res.rows} grid`;
  updateStats();
  fitView();
  draw();
  $("export").disabled = false;
}

// ---------- events ----------
$("file").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  originalName = f.name;
  model = parseHideout(await f.text());
  updateStats();
  fitView();
  draw();
  $("export").disabled = false;
});
$("img-file").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const url = URL.createObjectURL(f);
  $("src-preview").src = url;
  const img = await loadImageEl(url);
  srcImage = imageDataFrom(img);
  generate();
});
$("export").addEventListener("click", () => {
  const text = serializeHideout(model, { bom: model._hadBom !== false });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/octet-stream" }));
  a.download = originalName;
  a.click();
  URL.revokeObjectURL(a.href);
});
$("generate").addEventListener("click", generate);
$("m-cols").addEventListener("input", (e) => { $("m-cols-v").textContent = e.target.value; });
$("m-cols").addEventListener("change", generate);
$("m-ink").addEventListener("input", (e) => { $("m-ink-v").textContent = e.target.value; });
$("m-ink").addEventListener("change", generate);
$("m-mode").addEventListener("change", () => {
  $("m-ink-row").style.display = $("m-mode").value === "ink" ? "" : "none";
  generate();
});

// ---------- interaction: zoom / pan / hover ----------
cv.addEventListener("wheel", (e) => {
  e.preventDefault();
  const [wx, wy] = screenToWorld(e.offsetX, e.offsetY);
  view.scale *= Math.exp(-e.deltaY * 0.0015);
  const [nsx, nsy] = worldToScreen(wx, wy);
  view.cx += (nsx - e.offsetX) / view.scale;
  view.cy += (nsy - e.offsetY) / view.scale;
  draw();
}, { passive: false });
let dragging = null;
cv.addEventListener("mousedown", (e) => { dragging = { x: e.offsetX, y: e.offsetY }; });
window.addEventListener("mouseup", () => { dragging = null; });
cv.addEventListener("mousemove", (e) => {
  if (dragging) {
    view.cx -= (e.offsetX - dragging.x) / view.scale;
    view.cy -= (e.offsetY - dragging.y) / view.scale;
    dragging = { x: e.offsetX, y: e.offsetY };
    return draw();
  }
  if (!model) return;
  let best = null, bestD = 100;
  for (const d of model.doodads) {
    const [sx, sy] = worldToScreen(d.x, d.y);
    const dd = (sx - e.offsetX) ** 2 + (sy - e.offsetY) ** 2;
    if (dd < bestD) { bestD = dd; best = d; }
  }
  if (best) {
    tip.style.display = "block";
    tip.style.left = e.offsetX + "px"; tip.style.top = e.offsetY + "px";
    tip.textContent = best.name;
  } else tip.style.display = "none";
});
cv.addEventListener("mouseleave", () => { tip.style.display = "none"; });
window.addEventListener("resize", resize);

// ---------- boot ----------
(async function boot() {
  resize();
  await loadPalette();
  const img = await loadImageEl("./assets/dickbutt.jpg");
  srcImage = imageDataFrom(img);
  generate();
})();

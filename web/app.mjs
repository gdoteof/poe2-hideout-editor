import { parseHideout, serializeHideout } from "../src/hideout.mjs";
import { mosaicFromImage } from "../src/mosaic.mjs";
import {
  moveDoodad, rotateDoodad, flipDoodad, deleteDoodad, cloneDoodad, addDoodad, History,
} from "../src/edit.mjs";
import { pointInPolygon, boundingBox, boundsCenter, clampToBox } from "../src/bounds.mjs";
import { showPreview } from "./preview.mjs";

const cv = document.getElementById("cv");
const ctx = cv.getContext("2d");
const tip = document.getElementById("tip");
const $ = (id) => document.getElementById(id);

// Default base to place a from-scratch mosaic into (The Dreadnought — large).
const DEFAULT_BASE = { hideout_name: "The Dreadnought Hideout", hideout_hash: 30315 };

let model = null;
let originalName = "mosaic.hideout";
let palettes = { poe2: [], poe1: [] };
// per-game palette tweaks: parallel to palettes[game], { enabled, hex }
const paletteState = { poe2: null, poe1: null };
let bases = [];
let boundsMap = {}; // "game:hash" -> { poly, name, ... }
let srcImage = null; // { data, width, height }
const view = { scale: 1, cx: 0, cy: 0 };

// editing state
let selected = null; // index into model.doodads, or null
let history = null; // History over model.doodads snapshots
let addMode = false;
let drag = null; // { index, grabDX, grabDY, moved, prepared } | { pan:{x,y} }

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
// Fallback square side (world units) for "cells" view.
const IMPORT_CELL = 6;
// Soft cap: hideouts have a decoration limit; warn past this.
const DECORATION_BUDGET = 2000;
// Adaptive cell size for an imported layout: median nearest-neighbour distance,
// so squares read as cells at the layout's natural spacing. O(n^2), computed
// once per model and cached; skipped for very large layouts.
function computeAutoCell(doodads) {
  const n = doodads.length;
  if (n < 2 || n > 2500) return IMPORT_CELL;
  const dists = [];
  for (let i = 0; i < n; i++) {
    const a = doodads[i];
    let best = Infinity;
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const dx = a.x - doodads[j].x, dy = a.y - doodads[j].y;
      const d = dx * dx + dy * dy;
      if (d < best) best = d;
    }
    if (best < Infinity) dists.push(Math.sqrt(best));
  }
  dists.sort((a, b) => a - b);
  const med = dists[Math.floor(dists.length / 2)] || IMPORT_CELL;
  return Math.max(2, Math.min(24, Math.round(med)));
}
// Effective square side for cells view: manual slider, or auto (mosaic step
// when known, else adaptive). Auto also mirrors its value into the slider.
function cellSizeFor() {
  if (!$("cell-auto").checked) return +$("cell-size").value;
  let v;
  if (model._cell != null) v = model._cell;
  else { if (model._autoCell == null) model._autoCell = computeAutoCell(model.doodads); v = model._autoCell; }
  $("cell-size").value = Math.max(1, Math.min(24, Math.round(v)));
  return v;
}
function updateCellSizeRow() {
  $("cell-size-row").style.display = $("view-style").value === "cells" ? "" : "none";
}
function draw() {
  // neutral "floor" so decorations of any color read against it
  ctx.fillStyle = "#9aa0a8";
  ctx.fillRect(0, 0, cv.width, cv.height);
  if (!model) return;
  const style = $("view-style").value; // "cells" | "dots" — applies to any source
  const cellW = style === "cells" ? cellSizeFor() : IMPORT_CELL;
  if (style === "cells") {
    $("cell-size-v").textContent = Math.round(cellW);
    const s = Math.max(1, cellW * view.scale);
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
  // buildable-area outline
  if ($("show-bounds").checked) {
    const poly = boundsFor(currentGame(), model.hideout_hash);
    if (poly) {
      ctx.beginPath();
      poly.forEach((pt, i) => { const [sx, sy] = worldToScreen(pt[0], pt[1]); i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); });
      ctx.closePath();
      ctx.setLineDash([6, 4]); ctx.lineWidth = 1.5; ctx.strokeStyle = "#ffd54a"; ctx.stroke(); ctx.setLineDash([]);
    }
  }
  // selection highlight
  if (selected != null && model.doodads[selected]) {
    const d = model.doodads[selected];
    const [sx, sy] = worldToScreen(d.x, d.y);
    const r = Math.max(9, (style === "cells" ? cellW * view.scale : 8));
    ctx.lineWidth = 3; ctx.strokeStyle = "#000";
    ctx.strokeRect(sx - r / 2, sy - r / 2, r, r);
    ctx.lineWidth = 1.5; ctx.strokeStyle = "#fff";
    ctx.strokeRect(sx - r / 2, sy - r / 2, r, r);
  }
}
function updateStats() {
  if (!model) return;
  const d = model.doodads;
  const xs = d.map((o) => o.x), ys = d.map((o) => o.y);
  $("s-base").textContent = model.hideout_name ?? "—";
  $("s-hash").textContent = model.hideout_hash ?? "—";
  $("s-count").textContent = d.length;
  $("s-unique").textContent = new Set(d.map((o) => o.hash)).size;
  $("s-x").textContent = d.length ? `${Math.min(...xs)}–${Math.max(...xs)}` : "—";
  $("s-y").textContent = d.length ? `${Math.min(...ys)}–${Math.max(...ys)}` : "—";
}
function updateEditButtons() {
  const has = selected != null && model?.doodads[selected];
  ["rot-l", "rot-r", "flip", "dup", "del"].forEach((id) => { $(id).disabled = !has; });
  $("undo").disabled = !history?.canUndo();
  $("redo").disabled = !history?.canRedo();
  $("export").disabled = !model;
  $("preview").disabled = !model;
  $("sel-info").textContent = has
    ? `#${selected} · ${model.doodads[selected].name}`
    : "no selection";
}
function refresh() { updateStats(); updateEditButtons(); draw(); }

// ---------- data loading ----------
async function loadPalettes() {
  const load = async (f) => {
    try { const r = await fetch(f); if (!r.ok) return []; return (await r.json()).colors ?? []; }
    catch { return []; }
  };
  const [p2, p1] = await Promise.all([
    load("../data/palette.json"), load("../data/palette.poe1.json"),
  ]);
  palettes.poe2 = p2;
  palettes.poe1 = p1.length ? p1 : p2; // fall back to poe2 palette if poe1 missing
}
async function loadBounds() {
  try {
    const r = await fetch("../data/base-bounds.json");
    if (r.ok) boundsMap = (await r.json()).bounds ?? {};
  } catch { boundsMap = {}; }
}
// bounds entry for a base (imported files may not know their game, so fall back
// to any key with a matching hash).
function boundsEntry(game, hash) {
  if (hash == null) return null;
  return boundsMap[`${game}:${hash}`]
    || Object.entries(boundsMap).find(([k]) => k.endsWith(`:${hash}`))?.[1] || null;
}
function erodePoly(poly, f) {
  const c = boundsCenter(poly);
  return poly.map(([x, y]) => [Math.round(c.x + (x - c.x) * f), Math.round(c.y + (y - c.y) * f)]);
}
// Usable placement polygon. Convex-hull bounds are loose (they over-cover the
// true concave buildable edge, causing in-game "location invalid" rejections),
// so erode those inward; authoritative fre-sch polygons are used as-is.
function boundsFor(game, hash) {
  const e = boundsEntry(game, hash);
  if (!e?.poly || e.poly.length < 3) return null;
  return e.source === "empirical-hull" ? erodePoly(e.poly, 0.86) : e.poly;
}
async function loadBases() {
  const res = await fetch("../data/hideout-base-catalog.json");
  bases = (await res.json()).bases;
  const sel = $("base-pick");
  for (const game of ["poe2", "poe1"]) {
    const og = document.createElement("optgroup");
    og.label = game.toUpperCase();
    for (const b of bases.filter((x) => x.game === game)) {
      const o = document.createElement("option");
      o.value = `${b.game}:${b.hash}`;
      o.dataset.hash = b.hash;
      o.dataset.name = b.name;
      o.textContent = b.name + (b.verified ? "" : " (hash unverified)");
      og.appendChild(o);
    }
    sel.appendChild(og);
  }
  sel.value = "poe1:35022"; // Celestial Nebula — PoE1 has fine pixel decorations, best demo
}
function currentGame() {
  const v = $("base-pick").selectedOptions[0]?.value || "poe2:";
  return v.startsWith("poe1") ? "poe1" : "poe2";
}
function currentPalette() {
  return palettes[currentGame()]?.length ? palettes[currentGame()] : palettes.poe2;
}
function ensurePaletteState() {
  const game = currentGame();
  if (!paletteState[game]) {
    paletteState[game] = currentPalette().map((c) => ({ enabled: true, hex: c.hex }));
  }
}
// palette actually fed to the mosaic engine: enabled entries, recolored overrides applied
function effectivePalette() {
  ensurePaletteState();
  const game = currentGame(), pal = currentPalette(), st = paletteState[game];
  return pal.map((c, i) => ({ ...c, hex: st[i].hex })).filter((_, i) => st[i].enabled);
}
const hexLuma = (hex) => {
  const h = hex.replace("#", "");
  return 0.299 * parseInt(h.slice(0, 2), 16) + 0.587 * parseInt(h.slice(2, 4), 16) + 0.114 * parseInt(h.slice(4, 6), 16);
};
// Tile pitch (world units) = the decoration footprint to place at so tiles abut
// instead of overlapping. Ink mode uses the darkest (ink) entry's pitch; color
// mode uses the median pitch of enabled entries. Defaults to 2 if unspecified.
function tilePitch() {
  const pal = effectivePalette();
  if (!pal.length) return 2;
  if ($("m-mode").value === "ink") {
    const ink = pal.reduce((a, b) => (hexLuma(b.hex) < hexLuma(a.hex) ? b : a));
    return Math.max(1, Math.round(ink.pitch ?? 2));
  }
  const ps = pal.map((c) => c.pitch ?? 2).sort((a, b) => a - b);
  return Math.max(1, Math.round(ps[Math.floor(ps.length / 2)]));
}
function renderPaletteCount() {
  const st = paletteState[currentGame()] || [];
  $("pal-count").textContent = `${st.filter((s) => s.enabled).length}/${st.length}`;
}
function renderPalettePanel() {
  ensurePaletteState();
  const game = currentGame(), pal = currentPalette(), st = paletteState[game];
  const list = $("palette-list");
  list.innerHTML = "";
  pal.forEach((c, i) => {
    const row = document.createElement("label");
    row.className = "pal-row";
    const cb = document.createElement("input");
    cb.type = "checkbox"; cb.checked = st[i].enabled;
    cb.addEventListener("change", () => { st[i].enabled = cb.checked; renderPaletteCount(); if (model?._cell) generate(); });
    const col = document.createElement("input");
    col.type = "color"; col.value = st[i].hex;
    col.addEventListener("input", () => { st[i].hex = col.value; });
    col.addEventListener("change", () => { st[i].hex = col.value; if (model?._cell) generate(); });
    const nm = document.createElement("span");
    nm.className = "pal-name"; nm.textContent = c.name;
    row.append(cb, col, nm);
    list.appendChild(row);
  });
  renderPaletteCount();
}
function applyModeVisibility() {
  const ink = $("m-mode").value === "ink";
  $("m-ink-row").style.display = ink ? "" : "none";
  $("m-cov-row").style.display = ink ? "" : "none";
  $("m-bg-row").style.display = ink ? "none" : "";
}
// The base a freshly-generated mosaic is placed into (from the picker).
function currentBase() {
  const opt = $("base-pick").selectedOptions[0];
  return opt?.dataset.hash
    ? { hideout_name: opt.dataset.name, hideout_hash: +opt.dataset.hash }
    : DEFAULT_BASE;
}
function populateAddPick() {
  const sel = $("add-pick");
  sel.innerHTML = "";
  for (const c of currentPalette()) {
    const o = document.createElement("option");
    o.dataset.name = c.name; o.dataset.hash = c.hash; o.dataset.hex = c.hex;
    o.textContent = c.name;
    sel.appendChild(o);
  }
}
async function loadVersion() {
  try {
    const r = await fetch("./version.json");
    if (!r.ok) throw 0;
    const v = await r.json();
    return `PoE1 & PoE2 · v${v.version} · ${v.commit} · ${v.date}`;
  } catch {
    return "PoE1 & PoE2 · dev build";
  }
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

// ---------- edit ops (commit = apply + push history + redraw) ----------
function beginHistory() { history = new History(model.doodads); selected = null; }
function commit(newDoodads, newSelected = selected) {
  model.doodads = newDoodads;
  history.push(model.doodads);
  selected = newSelected;
  refresh();
}
function undo() { if (history?.canUndo()) { model.doodads = history.undo(); selected = null; refresh(); } }
function redo() { if (history?.canRedo()) { model.doodads = history.redo(); selected = null; refresh(); } }
function rot(delta) { if (selected != null) commit(rotateDoodad(model.doodads, selected, delta)); }
function flipSel() { if (selected != null) commit(flipDoodad(model.doodads, selected)); }
function delSel() { if (selected != null) commit(deleteDoodad(model.doodads, selected), null); }
function dupSel() {
  if (selected == null) return;
  const at = model.doodads.length; // clone is appended at the end
  commit(cloneDoodad(model.doodads, selected, 8, 8), at);
}
function nudge(dx, dy) { if (selected != null) commit(moveDoodad(model.doodads, selected, dx, dy)); }
function placeAt(wx, wy) {
  const opt = $("add-pick").selectedOptions[0];
  if (!opt) return;
  const at = model.doodads.length;
  const { x, y } = clampWorld(wx, wy);
  commit(addDoodad(model.doodads, {
    name: opt.dataset.name, hash: +opt.dataset.hash,
    x, y, r: 0, fv: 0, hex: opt.dataset.hex,
  }), at);
}
function pickDoodad(sx, sy) {
  if (!model) return null;
  let best = null, bestD = 14 ** 2;
  model.doodads.forEach((d, i) => {
    const [x, y] = worldToScreen(d.x, d.y);
    const dd = (x - sx) ** 2 + (y - sy) ** 2;
    if (dd < bestD) { bestD = dd; best = i; }
  });
  return best;
}

// ---------- mosaic ----------
function generate() {
  if (!srcImage) return;
  const pal = effectivePalette();
  if (!pal.length) { $("m-info").textContent = "Enable at least one palette color"; return; }
  const mode = $("m-mode").value;
  const base = currentBase();
  const poly = boundsFor(currentGame(), base.hideout_hash);
  const fit = $("m-fit").checked && poly;

  // step = the decoration's real footprint pitch, so tiles abut (not overlap).
  const step = fit ? tilePitch() : +$("m-step").value;
  let cols = +$("m-cols").value;
  let origin, capNote = "";

  if (fit) {
    // cap resolution so tiles at `step` pitch fit inside the buildable box, and center
    const bb = boundingBox(poly);
    const aspect = srcImage.height / srcImage.width;
    const colsByW = Math.floor((bb.maxX - bb.minX) / step);
    const colsByH = Math.floor((bb.maxY - bb.minY) / step / aspect);
    const capped = Math.max(1, Math.min(cols, colsByW, colsByH));
    if (capped < cols) capNote = ` · capped ${capped} cols to fit`;
    cols = capped;
    const rows = Math.max(1, Math.round(srcImage.height / (srcImage.width / cols)));
    const c = boundsCenter(poly);
    origin = { x: Math.round(c.x - (cols * step) / 2), y: Math.round(c.y - (rows * step) / 2) };
    // reflect the computed calibration into the sliders
    $("m-step").value = Math.min(6, step); $("m-step-v").textContent = step;
    $("m-cols").value = Math.max(30, Math.min(160, cols)); $("m-cols-v").textContent = cols;
    $("m-ox").value = origin.x; $("m-ox-v").textContent = origin.x;
    $("m-oy").value = origin.y; $("m-oy-v").textContent = origin.y;
  } else {
    origin = { x: +$("m-ox").value, y: +$("m-oy").value };
  }

  const res = mosaicFromImage(srcImage, pal, {
    mode, cols, step, origin,
    flipY: $("m-flipy").checked,
    inkThreshold: +$("m-ink").value,
    inkCoverage: +$("m-cov").value,
    bgHex: $("m-bg").value,
    bgTolerance: +$("m-bgtol").value,
  });

  let placements = res.placements, skipped = 0;
  if (fit) {
    const inside = placements.filter((p) => pointInPolygon(p.x, p.y, poly));
    skipped = placements.length - inside.length;
    placements = inside;
  }
  model = {
    version: 1, language: "English",
    hideout_name: base.hideout_name, hideout_hash: base.hideout_hash,
    doodads: placements.map(({ name, hash, x, y, r, fv, hex }) => ({ name, hash, x, y, r, fv, hex })),
    _hadBom: true,
    _cell: step,
  };
  beginHistory();
  const noBounds = $("m-fit").checked && !poly ? " · no bounds data for base" : "";
  const skipNote = skipped ? ` · ${skipped} outside bounds skipped` : "";
  const budgetNote = placements.length > DECORATION_BUDGET ? ` · ⚠ over ~${DECORATION_BUDGET} decoration limit` : "";
  $("m-info").textContent = `${placements.length} decorations · ${res.cols}×${res.rows} · pitch ${step}${skipNote}${capNote}${budgetNote}${noBounds}`;
  fitView();
  refresh();
}
function clampWorld(x, y) {
  if (!$("m-fit").checked) return { x: Math.round(x), y: Math.round(y) };
  const poly = boundsFor(currentGame(), model?.hideout_hash);
  return poly ? clampToBox(x, y, boundingBox(poly)) : { x: Math.round(x), y: Math.round(y) };
}
function updateFitLock() {
  const on = $("m-fit").checked;
  ["m-step", "m-ox", "m-oy"].forEach((id) => { $(id).disabled = on; });
}

// ---------- events ----------
$("file").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  originalName = f.name;
  model = parseHideout(await f.text());
  // reflect the loaded file's base in the picker (best-effort match by hash)
  const opt = [...$("base-pick").options].find((o) => +o.dataset.hash === model.hideout_hash);
  if (opt) $("base-pick").value = opt.value;
  $("view-style").value = "dots"; // imported layouts default to dots (flip to cells anytime)
  updateCellSizeRow();
  beginHistory();
  fitView();
  refresh();
});
$("img-file").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const url = URL.createObjectURL(f);
  $("src-preview").src = url;
  const img = await loadImageEl(url);
  srcImage = imageDataFrom(img);
  $("view-style").value = "cells"; // a fresh mosaic defaults to cells
  updateCellSizeRow();
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
$("preview").addEventListener("click", () => showPreview(model));
$("view-style").addEventListener("change", () => { updateCellSizeRow(); draw(); });
$("cell-auto").addEventListener("change", () => { $("cell-size").disabled = $("cell-auto").checked; draw(); });
$("cell-size").addEventListener("input", () => { $("cell-size-v").textContent = $("cell-size").value; draw(); });
$("generate").addEventListener("click", generate);
$("m-cols").addEventListener("input", (e) => { $("m-cols-v").textContent = e.target.value; });
$("m-cols").addEventListener("change", generate);
$("m-ink").addEventListener("input", (e) => { $("m-ink-v").textContent = e.target.value; });
$("m-ink").addEventListener("change", generate);
$("m-mode").addEventListener("change", () => { applyModeVisibility(); generate(); });
// advanced placement knobs: live value label + regenerate on release
for (const [id, vid] of [
  ["m-step", "m-step-v"], ["m-ox", "m-ox-v"], ["m-oy", "m-oy-v"],
  ["m-cov", "m-cov-v"], ["m-bgtol", "m-bgtol-v"],
]) {
  $(id).addEventListener("input", () => { $(vid).textContent = $(id).value; });
  $(id).addEventListener("change", generate);
}
$("m-flipy").addEventListener("change", generate);
$("m-bg").addEventListener("change", generate);
$("m-fit").addEventListener("change", () => { updateFitLock(); generate(); });
$("show-bounds").addEventListener("change", draw);
$("base-pick").addEventListener("change", () => {
  populateAddPick(); // palette can change with game
  renderPalettePanel(); // per-game palette tweaks
  if (model?._cell) generate(); // re-place an active mosaic into the new base
});

// edit toolbar
$("rot-l").addEventListener("click", () => rot(-90));
$("rot-r").addEventListener("click", () => rot(90));
$("flip").addEventListener("click", flipSel);
$("dup").addEventListener("click", dupSel);
$("del").addEventListener("click", delSel);
$("undo").addEventListener("click", undo);
$("redo").addEventListener("click", redo);
$("add-toggle").addEventListener("click", () => {
  addMode = !addMode;
  $("add-toggle").textContent = addMode ? "Adding… (click canvas)" : "Add on click";
  $("add-toggle").classList.toggle("on", addMode);
  cv.style.cursor = addMode ? "crosshair" : "";
});

// keyboard shortcuts
window.addEventListener("keydown", (e) => {
  const t = e.target.tagName;
  if (t === "INPUT" || t === "SELECT" || t === "TEXTAREA") return;
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (ctrl && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return; }
  if (selected == null) return;
  switch (e.key) {
    case "Delete": case "Backspace": e.preventDefault(); delSel(); break;
    case "r": rot(90); break;
    case "R": rot(-90); break;
    case "f": case "F": flipSel(); break;
    case "d": case "D": dupSel(); break;
    case "ArrowLeft": e.preventDefault(); nudge(e.shiftKey ? -10 : -1, 0); break;
    case "ArrowRight": e.preventDefault(); nudge(e.shiftKey ? 10 : 1, 0); break;
    case "ArrowUp": e.preventDefault(); nudge(0, e.shiftKey ? -10 : -1); break;
    case "ArrowDown": e.preventDefault(); nudge(0, e.shiftKey ? 10 : 1); break;
    case "Escape": selected = null; refresh(); break;
  }
});

// ---------- interaction: zoom / pan / select / drag / hover ----------
cv.addEventListener("wheel", (e) => {
  e.preventDefault();
  const [wx, wy] = screenToWorld(e.offsetX, e.offsetY);
  view.scale *= Math.exp(-e.deltaY * 0.0015);
  const [nsx, nsy] = worldToScreen(wx, wy);
  view.cx += (nsx - e.offsetX) / view.scale;
  view.cy += (nsy - e.offsetY) / view.scale;
  draw();
}, { passive: false });
cv.addEventListener("mousedown", (e) => {
  if (!model) return;
  const [wx, wy] = screenToWorld(e.offsetX, e.offsetY);
  if (addMode) { placeAt(wx, wy); return; }
  const idx = pickDoodad(e.offsetX, e.offsetY);
  if (idx != null) {
    selected = idx;
    const d = model.doodads[idx];
    drag = { index: idx, grabDX: d.x - wx, grabDY: d.y - wy, moved: false, prepared: false };
    refresh();
  } else {
    drag = { pan: { x: e.offsetX, y: e.offsetY } };
    selected = null;
    refresh();
  }
});
window.addEventListener("mouseup", () => {
  if (drag && drag.index != null && drag.moved) history.push(model.doodads);
  drag = null;
  updateEditButtons();
});
cv.addEventListener("mousemove", (e) => {
  if (drag?.pan) {
    view.cx -= (e.offsetX - drag.pan.x) / view.scale;
    view.cy -= (e.offsetY - drag.pan.y) / view.scale;
    drag.pan = { x: e.offsetX, y: e.offsetY };
    return draw();
  }
  if (drag && drag.index != null) {
    // lazily copy the dragged entry so the last history snapshot isn't mutated
    if (!drag.prepared) {
      model.doodads = model.doodads.map((d, i) => (i === drag.index ? { ...d } : d));
      drag.prepared = true;
    }
    const [wx, wy] = screenToWorld(e.offsetX, e.offsetY);
    const d = model.doodads[drag.index];
    const p = clampWorld(wx + drag.grabDX, wy + drag.grabDY);
    d.x = p.x; d.y = p.y;
    drag.moved = true;
    return draw();
  }
  if (!model) return;
  const idx = pickDoodad(e.offsetX, e.offsetY);
  if (idx != null) {
    tip.style.display = "block";
    tip.style.left = e.offsetX + "px"; tip.style.top = e.offsetY + "px";
    tip.textContent = model.doodads[idx].name;
  } else tip.style.display = "none";
});
cv.addEventListener("mouseleave", () => { tip.style.display = "none"; });
window.addEventListener("resize", resize);

// ---------- boot ----------
(async function boot() {
  resize();
  loadVersion().then((s) => { $("app-version").textContent = s; });
  await Promise.all([loadPalettes(), loadBases(), loadBounds()]);
  populateAddPick();
  renderPalettePanel();
  applyModeVisibility();
  updateCellSizeRow();
  updateFitLock();
  const img = await loadImageEl("./assets/dickbutt.jpg");
  srcImage = imageDataFrom(img);
  generate();
})();

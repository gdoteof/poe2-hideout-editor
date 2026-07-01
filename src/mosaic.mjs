// Image -> hideout mosaic engine.
//
// Converts an RGBA image into a list of doodad placements: the image is
// downsampled to a grid; each non-transparent cell becomes a decoration whose
// palette color best matches the cell's average color. Pure and Node-testable
// (takes raw pixel data, returns plain objects) so it runs identically in the
// browser and in tests.

// ---- color: sRGB -> CIE Lab, for perceptual nearest-match ----
function srgbToLinear(c) {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
function rgbToLab(r, g, b) {
  const R = srgbToLinear(r), G = srgbToLinear(g), B = srgbToLinear(b);
  // linear RGB -> XYZ (D65)
  let x = R * 0.4124 + G * 0.3576 + B * 0.1805;
  let y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  let z = R * 0.0193 + G * 0.1192 + B * 0.9505;
  x /= 0.95047; z /= 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x), fy = f(y), fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
export function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

// Prepare a palette (array of {name, hash, hex}) with cached Lab values.
export function preparePalette(palette) {
  return palette.map((p) => {
    const [r, g, b] = hexToRgb(p.hex);
    return { ...p, _lab: rgbToLab(r, g, b) };
  });
}

function nearest(prepared, lab) {
  let best = prepared[0], bestD = Infinity;
  for (const p of prepared) {
    const dl = p._lab[0] - lab[0], da = p._lab[1] - lab[1], db = p._lab[2] - lab[2];
    const d = dl * dl + da * da + db * db;
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}

const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

// Pick the darkest palette entry (used as the "ink" for line-art mode).
function darkest(prepared) {
  return prepared.reduce((a, b) => (b._lab[0] < a._lab[0] ? b : a));
}

// image: { data: Uint8ClampedArray(RGBA), width, height }
// opts:
//   mode            'color' (nearest palette color) | 'ink' (trace dark lines) ['color']
//   cols            grid width in cells (rows derived from aspect)         [required]
//   origin          { x, y } world grid coord of the top-left cell         [{x:0,y:0}]
//   step            world grid units between adjacent cells                [2]
//   flipY           map image top -> larger world Y instead of smaller     [false]
//   -- color mode --
//   alphaThreshold  cells with avg alpha below this are left empty         [128]
//   bgHex           optional solid background color to also treat as empty [null]
//   bgTolerance     Lab distance under which a cell counts as background   [10]
//   -- ink mode (for black-on-white line art) --
//   inkThreshold    a pixel counts as "ink" if its luma is below this      [110]
//   inkCoverage     place a doodad if this fraction of the cell is ink     [0.18]
//   inkHex          ink color; defaults to the darkest palette entry       [auto]
//   -- color-quality options --
//   dither          'none' | 'fs' (Floyd–Steinberg) | 'bayer' (ordered)   ['none']
//   outline         also lay the darkest (ink) decoration along strong     [false]
//                   image edges, on top of the fill (cel-shading readability)
//   outlineThreshold  Sobel gradient magnitude above which a cell is edge  [60]
export function mosaicFromImage(image, palette, opts = {}) {
  const {
    mode = "color",
    cols,
    origin = { x: 0, y: 0 },
    step = 2,
    flipY = false,
    alphaThreshold = 128,
    bgHex = null,
    bgTolerance = 10,
    inkThreshold = 110,
    inkCoverage = 0.18,
    inkHex = null,
    dither = "none",
    outline = false,
    outlineThreshold = 60,
  } = opts;
  if (!cols || cols < 1) throw new Error("cols must be >= 1");

  const prepared = preparePalette(palette);
  const bgLab = bgHex ? rgbToLab(...hexToRgb(bgHex)) : null;
  // ink decoration: explicit for ink mode; darkest palette entry otherwise (outline)
  const ink = inkHex
    ? preparePalette([palette.find((p) => p.hex.toLowerCase() === inkHex.toLowerCase()) ?? palette[0]])[0]
    : darkest(prepared);

  const { data, width, height } = image;
  const cellW = width / cols;
  const rows = Math.max(1, Math.round(height / cellW));
  const cellH = height / rows;
  const N = rows * cols;

  const place = (col, row, p) => {
    const wx = origin.x + col * step;
    const wy = origin.y + (flipY ? rows - 1 - row : row) * step;
    return { name: p.name, hash: p.hash, x: Math.round(wx), y: Math.round(wy), r: 0, fv: 0, hex: p.hex };
  };

  // pass 1: aggregate each cell's mean color, coverage, luma
  const cR = new Float32Array(N), cG = new Float32Array(N), cB = new Float32Array(N);
  const cA = new Float32Array(N), cInk = new Float32Array(N), cLuma = new Float32Array(N);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x0 = Math.floor(col * cellW), x1 = Math.min(width, Math.ceil((col + 1) * cellW));
      const y0 = Math.floor(row * cellH), y1 = Math.min(height, Math.ceil((row + 1) * cellH));
      let r = 0, g = 0, b = 0, a = 0, n = 0, inkPx = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * width + x) * 4;
          const al = data[i + 3];
          r += data[i] * al; g += data[i + 1] * al; b += data[i + 2] * al;
          a += al; n++;
          if (al >= 128 && luma(data[i], data[i + 1], data[i + 2]) < inkThreshold) inkPx++;
        }
      }
      const k = row * cols + col;
      cA[k] = n ? a / n : 0;
      cInk[k] = n ? inkPx / n : 0;
      if (a) { cR[k] = r / a; cG[k] = g / a; cB[k] = b / a; }
      cLuma[k] = luma(cR[k], cG[k], cB[k]);
    }
  }

  const placements = [];
  let empty = 0;

  if (mode === "ink") {
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (cInk[row * cols + col] >= inkCoverage) placements.push(place(col, row, ink));
        else empty++;
      }
    }
  } else {
    // color mode, with optional dithering to fake more tones than the palette has
    const errR = new Float32Array(N), errG = new Float32Array(N), errB = new Float32Array(N);
    const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
    const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const k = row * cols + col;
        if (cA[k] < alphaThreshold) { empty++; continue; }
        let R = cR[k], G = cG[k], B = cB[k];
        if (dither === "fs") { R += errR[k]; G += errG[k]; B += errB[k]; }
        else if (dither === "bayer") { const t = (BAYER[row & 3][col & 3] / 16 - 0.5) * 40; R += t; G += t; B += t; }
        R = clamp(R); G = clamp(G); B = clamp(B);
        const lab = rgbToLab(R, G, B);
        if (bgLab) {
          const d = (bgLab[0] - lab[0]) ** 2 + (bgLab[1] - lab[1]) ** 2 + (bgLab[2] - lab[2]) ** 2;
          if (d < bgTolerance * bgTolerance) { empty++; continue; }
        }
        const chosen = nearest(prepared, lab);
        placements.push(place(col, row, chosen));
        if (dither === "fs") {
          const [pr, pg, pb] = hexToRgb(chosen.hex);
          const er = R - pr, eg = G - pg, eb = B - pb;
          const add = (kk, f) => { if (kk >= 0 && kk < N) { errR[kk] += er * f; errG[kk] += eg * f; errB[kk] += eb * f; } };
          if (col + 1 < cols) add(k + 1, 7 / 16);
          if (row + 1 < rows) { if (col > 0) add(k + cols - 1, 3 / 16); add(k + cols, 5 / 16); if (col + 1 < cols) add(k + cols + 1, 1 / 16); }
        }
      }
    }
    // outline pass: darkest decoration along strong edges, appended on top of fill
    if (outline) {
      const at = (r, c) => cLuma[Math.max(0, Math.min(rows - 1, r)) * cols + Math.max(0, Math.min(cols - 1, c))];
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          if (cA[row * cols + col] < alphaThreshold) continue;
          const gx = at(row, col + 1) - at(row, col - 1);
          const gy = at(row + 1, col) - at(row - 1, col);
          if (Math.hypot(gx, gy) > outlineThreshold) placements.push(place(col, row, ink));
        }
      }
    }
  }
  return { placements, cols, rows, step, scanned: N, empty, used: placements.length };
}

// Lossless, dependency-free reader/writer for PoE1 & PoE2 .hideout files.
//
// Why this exists: `doodads` is emitted as a JSON object but contains DUPLICATE
// KEYS (many doodads share a name). Native JSON.parse silently collapses them,
// destroying most of a layout. We parse to an ordered list of {name,...} and
// serialize back byte-for-byte (BOM, 2-space indent, ": " separators, no
// trailing newline) so read->write is lossless.
//
// See docs/hideout-format.md for the full format spec.

const BOM = "﻿";

// ---------------------------------------------------------------------------
// Duplicate-key-preserving JSON parser.
// Objects are returned as arrays of [key, value] pairs (order + dupes kept).
// Arrays/strings/numbers/bool/null are returned as native values.
// ---------------------------------------------------------------------------
function parseJsonOrdered(text) {
  let i = 0;
  const n = text.length;

  const err = (msg) => {
    throw new SyntaxError(`${msg} at position ${i}`);
  };
  const ws = () => {
    while (i < n) {
      const c = text.charCodeAt(i);
      if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) i++;
      else break;
    }
  };

  function value() {
    ws();
    const c = text[i];
    if (c === "{") return object();
    if (c === "[") return array();
    if (c === '"') return string();
    if (c === "-" || (c >= "0" && c <= "9")) return number();
    if (text.startsWith("true", i)) { i += 4; return true; }
    if (text.startsWith("false", i)) { i += 5; return false; }
    if (text.startsWith("null", i)) { i += 4; return null; }
    err(`Unexpected token '${c}'`);
  }

  function object() {
    const pairs = [];
    i++; // {
    ws();
    if (text[i] === "}") { i++; return pairs; }
    for (;;) {
      ws();
      if (text[i] !== '"') err("Expected string key");
      const key = string();
      ws();
      if (text[i] !== ":") err("Expected ':'");
      i++;
      pairs.push([key, value()]);
      ws();
      const ch = text[i++];
      if (ch === ",") continue;
      if (ch === "}") return pairs;
      err("Expected ',' or '}'");
    }
  }

  function array() {
    const arr = [];
    i++; // [
    ws();
    if (text[i] === "]") { i++; return arr; }
    for (;;) {
      arr.push(value());
      ws();
      const ch = text[i++];
      if (ch === ",") continue;
      if (ch === "]") return arr;
      err("Expected ',' or ']'");
    }
  }

  function string() {
    i++; // opening quote
    let out = "";
    for (;;) {
      const c = text[i++];
      if (c === undefined) err("Unterminated string");
      if (c === '"') return out;
      if (c === "\\") {
        const e = text[i++];
        if (e === '"' || e === "\\" || e === "/") out += e;
        else if (e === "n") out += "\n";
        else if (e === "t") out += "\t";
        else if (e === "r") out += "\r";
        else if (e === "b") out += "\b";
        else if (e === "f") out += "\f";
        else if (e === "u") {
          out += String.fromCharCode(parseInt(text.substr(i, 4), 16));
          i += 4;
        } else err(`Bad escape '\\${e}'`);
      } else {
        out += c;
      }
    }
  }

  function number() {
    const start = i;
    if (text[i] === "-") i++;
    while (i < n && text[i] >= "0" && text[i] <= "9") i++;
    if (text[i] === ".") { i++; while (i < n && text[i] >= "0" && text[i] <= "9") i++; }
    if (text[i] === "e" || text[i] === "E") {
      i++;
      if (text[i] === "+" || text[i] === "-") i++;
      while (i < n && text[i] >= "0" && text[i] <= "9") i++;
    }
    return Number(text.slice(start, i));
  }

  const result = value();
  ws();
  if (i !== n) err("Trailing content");
  return result;
}

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------
// { version, language, hideout_name, hideout_hash,
//   doodads: [ { name, hash, x, y, r, fv }, ... ] }   // ordered, dupes kept

const KNOWN_TOP = ["version", "language", "hideout_name", "hideout_hash", "doodads"];

export function parseHideout(text) {
  const hadBom = text.charCodeAt(0) === 0xfeff;
  if (hadBom) text = text.slice(1);
  const trailing = text.slice(text.trimEnd().length); // trailing whitespace, if any
  const pairs = parseJsonOrdered(text);
  const top = Object.fromEntries(pairs); // meta keys are unique; safe

  const doodadPairs = pairs.find((p) => p[0] === "doodads")?.[1] ?? [];
  const doodads = doodadPairs.map(([name, fields]) => {
    const f = Object.fromEntries(fields);
    return { name, hash: f.hash, x: f.x, y: f.y, r: f.r, fv: f.fv };
  });

  // Preserve any non-standard top-level keys (e.g. PoE1's music_name/music_hash)
  // and their original order so read->write stays byte-exact.
  const extra = {};
  for (const [k, v] of pairs) if (!KNOWN_TOP.includes(k)) extra[k] = v;

  return {
    version: top.version,
    language: top.language,
    hideout_name: top.hideout_name,
    hideout_hash: top.hideout_hash,
    doodads,
    _hadBom: hadBom,
    _trailing: trailing,
    _topKeys: pairs.map((p) => p[0]),
    _extra: extra,
  };
}

// Byte-exact serializer: mirrors JSON.stringify(x, null, 2) formatting while
// assembling `doodads` from the ordered array (so duplicate names survive).
export function serializeHideout(model, { bom = true } = {}) {
  const j = (v) => JSON.stringify(v); // top-level values are all primitives
  const order = model._topKeys ?? KNOWN_TOP;
  const extra = model._extra ?? {};
  const lines = [];
  lines.push("{");
  order.forEach((key, ki) => {
    const comma = ki === order.length - 1 ? "" : ",";
    if (key === "doodads") {
      lines.push(`  "doodads": {`);
      model.doodads.forEach((d, idx) => {
        const c = idx === model.doodads.length - 1 ? "" : ",";
        lines.push(`    ${j(d.name)}: {`);
        lines.push(`      "hash": ${j(d.hash)},`);
        lines.push(`      "x": ${j(d.x)},`);
        lines.push(`      "y": ${j(d.y)},`);
        lines.push(`      "r": ${j(d.r)},`);
        lines.push(`      "fv": ${j(d.fv)}`);
        lines.push(`    }${c}`);
      });
      lines.push(`  }${comma}`);
    } else {
      // Known keys read from the model (so edits apply); others from _extra.
      const val = KNOWN_TOP.includes(key) ? model[key] : extra[key];
      lines.push(`  ${j(key)}: ${j(val)}${comma}`);
    }
  });
  lines.push("}");
  return (bom ? BOM : "") + lines.join("\n") + (model._trailing ?? "");
}

// ---------------------------------------------------------------------------
// Field helpers
// ---------------------------------------------------------------------------
export const rToDegrees = (r) => (r / 65536) * 360;
export const degreesToR = (deg) => Math.round(((deg % 360) / 360) * 65536) & 0xffff;

export const fvVariation = (fv) => fv & 0x7f;
export const fvFlipped = (fv) => (fv & 0x80) !== 0;
export const makeFv = (variation, flipped) => (variation & 0x7f) | (flipped ? 0x80 : 0);

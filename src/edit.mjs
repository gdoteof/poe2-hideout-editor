// Pure, immutable editing engine for hideout `doodads` arrays.
//
// Every operation takes the current `doodads` array and returns a NEW array.
// The changed entry is a fresh object built via spread (`{...d, ...}`); all
// other entries are shared by reference. Unknown fields (e.g. `hex`) survive
// because we spread the original entry before applying changes.
//
// Immutable snapshots make undo/redo trivial (see `History`).
//
// Index-guard behavior: operations that target an existing entry
// (moveDoodad, setPosition, rotateDoodad, flipDoodad, setVariation,
// deleteDoodad, cloneDoodad) THROW a RangeError on an out-of-range index.
// (`addDoodad` takes no index and never throws for this reason.)

import {
  rToDegrees,
  degreesToR,
  fvVariation,
  fvFlipped,
  makeFv,
} from "./hideout.mjs";

// Validate an index against a doodads array; throw a clear error if invalid.
function assertIndex(doodads, index) {
  if (!Number.isInteger(index) || index < 0 || index >= doodads.length) {
    throw new RangeError(
      `doodad index ${index} out of range (0..${doodads.length - 1})`,
    );
  }
}

// Return a new array with entry `index` replaced by `{...entry, ...changes}`.
function replaceAt(doodads, index, changes) {
  assertIndex(doodads, index);
  return doodads.map((d, i) => (i === index ? { ...d, ...changes } : d));
}

export function moveDoodad(doodads, index, dx, dy) {
  assertIndex(doodads, index);
  const d = doodads[index];
  return replaceAt(doodads, index, {
    x: Math.round(d.x + dx),
    y: Math.round(d.y + dy),
  });
}

export function setPosition(doodads, index, x, y) {
  return replaceAt(doodads, index, { x: Math.round(x), y: Math.round(y) });
}

export function rotateDoodad(doodads, index, deltaDegrees) {
  assertIndex(doodads, index);
  const d = doodads[index];
  return replaceAt(doodads, index, {
    r: degreesToR(rToDegrees(d.r) + deltaDegrees),
  });
}

export function flipDoodad(doodads, index) {
  assertIndex(doodads, index);
  const fv = doodads[index].fv;
  return replaceAt(doodads, index, {
    fv: makeFv(fvVariation(fv), !fvFlipped(fv)),
  });
}

export function setVariation(doodads, index, variation) {
  assertIndex(doodads, index);
  const fv = doodads[index].fv;
  return replaceAt(doodads, index, {
    fv: makeFv(variation, fvFlipped(fv)),
  });
}

export function deleteDoodad(doodads, index) {
  assertIndex(doodads, index);
  return doodads.filter((_, i) => i !== index);
}

export function addDoodad(doodads, doodad) {
  return [...doodads, { ...doodad }];
}

export function cloneDoodad(doodads, index, dx = 0, dy = 0) {
  assertIndex(doodads, index);
  const d = doodads[index];
  return [
    ...doodads,
    { ...d, x: Math.round(d.x + dx), y: Math.round(d.y + dy) },
  ];
}

// ---------------------------------------------------------------------------
// Undo/redo history over immutable snapshots.
// ---------------------------------------------------------------------------
export class History {
  constructor(initialDoodads, { limit = 100 } = {}) {
    this._states = [initialDoodads];
    this._index = 0;
    this._limit = limit;
  }

  push(state) {
    // Drop any redo tail, then append the new state.
    this._states = this._states.slice(0, this._index + 1);
    this._states.push(state);
    // Cap history, dropping the oldest entries.
    if (this._states.length > this._limit) {
      this._states = this._states.slice(this._states.length - this._limit);
    }
    this._index = this._states.length - 1;
    return state;
  }

  undo() {
    if (this.canUndo()) this._index--;
    return this.current;
  }

  redo() {
    if (this.canRedo()) this._index++;
    return this.current;
  }

  get current() {
    return this._states[this._index];
  }

  canUndo() {
    return this._index > 0;
  }

  canRedo() {
    return this._index < this._states.length - 1;
  }
}

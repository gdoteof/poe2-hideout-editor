# PoE Hideout Customizer

A fully client-side toolkit and visual editor for **Path of Exile 1 & 2
`.hideout` files** (they share one JSON format). Its headline feature turns an
image into a decoration **mosaic** you can import into your hideout.

![dickbutt mosaic](web/assets/dickbutt.jpg)

## Run it

No build step, no dependencies — just serve the folder and open the app:

```bash
npm run serve          # python3 -m http.server 8731
# open http://localhost:8731/web/
```

The app boots with a demo image and auto-generates a mosaic. Use **Replace
image** to try your own, tweak **Mode** / **Resolution**, then **Export
.hideout**. You can also **Open .hideout** to view/round-trip an existing file.

## What works today

- **Lossless read/write** of `.hideout` files — preserves the UTF-8 BOM, all
  top-level keys and their order (incl. PoE1's optional `music_name`/`music_hash`),
  and (critically) the *duplicate keys* in `doodads` that a normal `JSON.parse`
  silently destroys. 26 real PoE1 + PoE2 files round-trip byte-for-byte.
- **PoE1 & PoE2** from the same engine — no format branching. A **target base**
  picker (`data/hideout-base-catalog.json`) chooses which hideout a mosaic targets.
- **Per-base buildable bounds** (`data/base-bounds.json`, `src/bounds.mjs`) — with
  "Fit to base bounds" on, a mosaic auto-scales and centers inside the base's valid
  area and cells that fall outside are skipped, so decorations aren't rejected on
  import. The boundary is drawn on the canvas and editing is clamped to it.
  Authoritative polygons for Canal/Felled/Shrine/Limestone (PoE2); conservative
  convex hulls (from real layouts) for the rest.
- **Image → mosaic** engine (`src/mosaic.mjs`):
  - **Ink mode** — traces black-on-white line art (the default demo).
  - **Color mode** — nearest-palette-color per grid cell, with transparent /
    background removal.
- **Editing** (`src/edit.mjs`) — select/move/rotate/flip/duplicate/delete/add with
  undo-redo. **Palette editor** — enable/disable and recolor entries live.
- **Top-down viewer** — pan, zoom, hover; toggle **Cells/Dots** view with
  auto/manual cell size. **Preview** the exact export before saving.

## Test

```bash
npm test    # byte-exact round-trip of all samples + mosaic engine checks
```

## Layout

| Path | What |
|------|------|
| `src/hideout.mjs` | Lossless parser + byte-exact serializer + field helpers |
| `src/mosaic.mjs`  | Image → doodad-placement engine |
| `web/`            | The client-side editor (plain ES modules + Canvas) |
| `data/samples/poe1/`, `poe2/` | Real `.hideout` files used as tests/fixtures |
| `data/palette.json`  | Mosaic color palette (**provisional** — see below) |
| `data/hideout-base-catalog.json` | Base `hideout_hash` catalog (drives the picker) |
| `data/base-bounds.json` | Per-base buildable-area polygons (fit + lock-out) |
| `data/decoration-catalog.json` | `hash → name` harvested from samples |
| `docs/hideout-format.md` | Full reverse-engineered format spec |
| `docs/roadmap.md` | Status and next steps |

## Known limitations

- **Palette = real tiling "pixels" with a measured `pitch`.** Palettes are built
  from decorations that real hideout art tiles densely (e.g. PoE1 *Volcanic
  Pebble*, 3349 uses at ~1.4-unit spacing), each tagged with its footprint
  `pitch`. The mosaic places tiles at that pitch so they abut instead of
  overlapping. Hashes are real; most **hex colors are still estimated** from
  theme, so color mosaics may not match the preview until sampled in-game.
- **PoE2 palette is coarse / hue-limited.** The PoE2 sample corpus is all warm
  desert/jungle (Faridun/Maraketh/Vaal) with large-pitch decorations — so PoE2
  mosaics are low-resolution and lack true red/blue/purple/white. PoE1 has fine
  pixels and is the better demo (hence the default base is Celestial Nebula).
- **In-game footprint needs confirmation.** `pitch` is measured from real
  layouts, but the exact in-game tile size per decoration isn't verified — a
  mosaic may still need a pitch nudge to tile perfectly. Re-test on import.
- **Bounds accuracy varies by base.** Canal/Felled/Shrine/Limestone (PoE2) use
  exact buildable polygons; every other base uses a convex hull of where real
  decorations sit — conservative but approximate (it can over-cover concave
  notches). Celestial (34604) has no bounds data yet.
- **Coordinate calibration (legacy note).** With "Fit to base bounds" off, mosaic
  placement uses a single default grid origin/step; the buildable extent differs
  per base and still needs calibrating
  so exports land nicely in-game.
- **Mosaic palette is PoE2-only for now.** The base picker and lossless
  load/save work for both games, but the mosaic palette uses PoE2 decoration
  hashes — a PoE1 mosaic needs its own palette (separate task). Loading/editing/
  exporting existing PoE1 files is unaffected.
- Editing (move/rotate/delete individual decorations) and undo/redo are not in
  yet — see `docs/roadmap.md`.

See `docs/hideout-format.md` for the format details this is all built on.

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
- **Image → mosaic** engine (`src/mosaic.mjs`):
  - **Ink mode** — traces black-on-white line art (the default demo).
  - **Color mode** — nearest-palette-color per grid cell, with transparent /
    background removal.
- **Top-down viewer** — pan, zoom, hover for decoration names.

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
| `data/decoration-catalog.json` | `hash → name` harvested from samples |
| `docs/hideout-format.md` | Full reverse-engineered format spec |
| `docs/roadmap.md` | Status and next steps |

## Known limitations

- **Palette colors are partly estimated.** Decoration `hash`/`name` values are
  now **real** (harvested from actual PoE2 files; name↔hash is a verified global
  1:1 mapping, so they're portable). Ink mode uses a confirmed dark decoration
  (Black Incense Burner). But most **color-mode** hex values are inferred from
  each decoration's theme, not yet sampled top-down in-game — so color mosaics
  may not match the preview until those are verified. True white/skin remain the
  weakest (best candidates: Light Mural Tile / Faridun Cloth).
- **Coordinate calibration.** Mosaic placement uses a single default grid
  origin/step; the buildable extent differs per base and still needs calibrating
  so exports land nicely in-game.
- **Mosaic palette is PoE2-only for now.** The base picker and lossless
  load/save work for both games, but the mosaic palette uses PoE2 decoration
  hashes — a PoE1 mosaic needs its own palette (separate task). Loading/editing/
  exporting existing PoE1 files is unaffected.
- Editing (move/rotate/delete individual decorations) and undo/redo are not in
  yet — see `docs/roadmap.md`.

See `docs/hideout-format.md` for the format details this is all built on.

# PoE2 Hideout Customizer

A fully client-side toolkit and visual editor for **Path of Exile 2 `.hideout`
files**. Its headline feature turns an image into a decoration **mosaic** you can
import into your hideout.

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

- **Lossless read/write** of `.hideout` files — preserves the UTF-8 BOM, key
  order, and (critically) the *duplicate keys* in `doodads` that a normal
  `JSON.parse` silently destroys. 10 real sample files round-trip byte-for-byte.
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
| `data/samples/poe2/` | Real `.hideout` files used as tests/fixtures |
| `data/palette.json`  | Mosaic color palette (**provisional** — see below) |
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
- **Coordinate calibration.** Mosaic placement uses a default grid origin/step;
  the exact buildable extent per hideout base still needs calibrating so exports
  land nicely in-game.
- Editing (move/rotate/delete individual decorations) and undo/redo are not in
  yet — see `docs/roadmap.md`.

See `docs/hideout-format.md` for the format details this is all built on.

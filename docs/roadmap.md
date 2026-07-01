# Roadmap — PoE2 Hideout Customizer

**Goal:** a fully client-side JavaScript visual editor for PoE2 `.hideout` files.
Headline feature: **import an image → auto-generate a color-mosaic floor layout.**

## Stack

- **Client-side only**, no backend. Plain ES modules + Canvas 2D, no bundler
  required for dev (served as static files). Keep dependencies minimal; add a
  bundler (Vite) only if/when needed.
- Shared core `src/hideout.mjs` is browser- and Node-compatible (no Node APIs),
  used by both the web app and the test suite.

## Status

- [x] **Format reverse-engineered** — `docs/hideout-format.md`.
- [x] **Lossless core** — `src/hideout.mjs`: duplicate-key-preserving parser +
      byte-exact serializer + field helpers. 10/10 samples round-trip identical
      (`npm test`).
- [x] **Sample corpus + seed catalogs** — `data/samples/poe2/`,
      `data/decoration-catalog.json`, `data/hideout-base-catalog.json`.
- [x] **Web viewer** — load a `.hideout`, render doodads top-down on canvas
      (pan/zoom, hover names), export back losslessly. `web/`.
- [x] **Image → mosaic engine** — `src/mosaic.mjs` (ink + color modes); default
      dickbutt demo renders cleanly and exports (637 dup-key doodads verified).
- [x] **Real palette hashes** — `data/palette.json` now uses real, portable
      decoration hashes (22 entries) harvested from actual PoE2 files; catalog
      grown to 142 entries. Ink = Black Incense Burner (confirmed dark).
- [ ] **Verify palette colors in-game** — most color-mode hex values are
      estimated from theme, not sampled top-down; confirm true white/black/skin
      (Light/Dark Mural Tile, Faridun Cloth) by placing + exporting in-game.
- [ ] **Coordinate calibration** — per-base buildable extent so exports land
      well in-game; verify against a real import.
- [ ] **Editor** — select / move / rotate / flip / variation / add / delete /
      duplicate; undo-redo; decoration picker.

## Open dependency: the decoration palette (GGPK extraction)

Decided: source the palette by **extracting from PoE2 game data** (richest).
Reality check: **no PoE2 install exists on this machine**, so extraction must
either run against GGG's patch CDN (no install needed) or against the user's
own install elsewhere. Candidate tooling:

- `pathofexile-dat` (npm, SnosMe) — reads PoE2 bundles/`.dat` **directly from
  the patch CDN**, no local game files. Best fit for a JS project.
- `HideoutDoodads.dat` / `Hideouts.dat` give names, icon paths, master, cost,
  variation counts. **Top-down color is not in `.dat`** — it must be derived
  from the decoration's texture/icon (DDS) or hand-tuned.
- Alternative: user provides their install path or an existing community JSON
  data dump.

The editor is built against a `palette.json` interface so this pipeline can land
independently without blocking UI work.

## Design notes for the mosaic engine (future)

- Fit the image into the target base's buildable grid extent (per-base; not in
  the file — get from `Hideouts.dat` or measure from samples).
- Respect a decoration-count budget (perf limit) by choosing cell size /
  downscaling; surface the count to the user.
- Per grid cell: pick nearest-color palette decoration; set `x,y`; optionally
  randomize `r`/`fv` variation for texture. Decorations may overlap freely.

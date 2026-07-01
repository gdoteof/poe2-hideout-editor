# Changelog

All notable changes to the PoE Hideout Customizer. Versioning is SemVer (0.x
pre-1.0, minor bump per feature release); each release is a git tag `vX.Y.Z`, and
the live build shows `version · commit · date` (from `dist/version.json`).

## [0.11.0] — 2026-07-01
### Added
- **In-app changelog** — a "changelog" link by the version opens this file in a
  modal, so releases are visible without leaving the app.

## [0.10.0] — 2026-07-01
### Added
- **Ink-item picker** — line-art mode defaults to "Auto (darkest)" but you can
  choose any palette decoration as the ink.
- **CHANGELOG.md** (this file).
### Changed
- **PoE1 & PoE2 palettes rebuilt to small pixel decorations only** (pitch ≤ 5 for
  PoE1; PoE2 capped at the corpus-limited ~10). Big/rare terrain tiles that
  overlapped into blobs were dropped. PoE1 ink = Volcanic Pebble.
- **Color-mode step = the largest enabled pitch** so mixed decorations never
  overlap into a blob.
- Arrow-key nudges are now clamped to the base bounds.

## [0.9.0] — 2026-07-01
### Fixed
- **In-game grid mapping.** Mosaics overlapped into blobs / hit "location
  invalid" on import because the palette used large terrain tiles at mosaic
  density. Root cause: decoration footprint vs. placement pitch.
### Changed
- Palettes rebuilt from decorations real art tiles densely, each with a measured
  `pitch`; mosaic **step = pitch** so tiles abut. Fit mode caps columns to the
  base and centers; decoration-limit warning added.
- Hull bounds eroded ~14% inward to reduce edge rejections; authoritative polys
  kept exact. Default base → Celestial Nebula (PoE1 has fine pixels).

## [0.8.0] — 2026-07-01
### Added
- **Per-base buildable bounds** (`data/base-bounds.json`, `src/bounds.mjs`):
  "Fit to base bounds" auto-scales + centers a mosaic inside the base and skips
  out-of-bounds cells; buildable area drawn; editing clamped to it. Authoritative
  polygons for Canal/Felled/Shrine/Limestone (PoE2), convex hulls elsewhere.

## [0.7.0] — 2026-07-01
### Added
- **Cell size control** — Auto (adaptive from decoration spacing) or a manual slider.

## [0.6.0] — 2026-07-01
### Added
- **Cells/Dots view toggle** — applies to any layout (imports and mosaics).

## [0.5.0] — 2026-07-01
### Added
- **Mosaic knobs** — spacing, offset X/Y, flip-vertical, ink coverage, background
  color + tolerance.
- **Palette editor** — enable/disable and recolor entries live.

## [0.4.0] — 2026-07-01
### Added
- **Version indicator** — SemVer + build-time git SHA/date, shown in the sidebar.

## [0.3.0] — 2026-06-30
### Added
- **Editing** (`src/edit.mjs`): select/move/rotate/flip/duplicate/delete/add with
  undo-redo. **Preview** the exact export before saving. **PoE1 mosaic palette.**

## [0.2.0] — 2026-06-30
### Added
- **PoE1 support** (same JSON engine; preserves optional `music_*` keys) and a
  **target-base picker** with a game-tagged base catalog.

## [0.1.0] — 2026-06-30
### Added
- Initial tool: lossless `.hideout` load/save (duplicate-key safe), top-down
  viewer, image→decoration **mosaic** engine (ink + color), dickbutt demo.
- Deployed to Cloudflare Pages (buttstuff.pages.dev).

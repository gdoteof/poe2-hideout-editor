# PoE2 `.hideout` File Format

Derived by direct analysis of **10 real exported files** (1 from
hideoutshowcase.com + 9 PoE2 samples harvested from
`mas0ny1/POE-Hideout-Migration-Tool`), cross-checked against community parsers.
See `data/samples/poe2/`, `data/decoration-catalog.json`,
`data/hideout-base-catalog.json`.

There are **two format eras**:
- **Legacy (old PoE1, ~2019–2020):** UTF‑16LE, Lua-table-like lines
  (`Name = { Hash=.., X=.., Y=.., Rot=.., Flip=.., Var=.. }`). Not relevant to
  PoE2 but useful context: the modern `fv` field is the old `Flip`+`Var` packed.
- **Modern (current PoE1 **and all PoE2**):** the JSON documented below,
  `version: 1`. **PoE2 uses the identical JSON schema as modern PoE1** — the only
  real differences are the larger coordinate grid and PoE2-specific
  doodad/base names & hashes.

All 10 sampled files were `version: 1`, UTF‑8 **with BOM**, with a uniform
`(hash, x, y, r, fv)` doodad schema.

## Container

- **Encoding:** UTF-8 **with BOM** (`EF BB BF`).
- **Serialization:** JSON, pretty-printed with 2-space indentation.
- **Extension:** `.hideout`. The game imports it via the hideout edit UI.

## Top-level object

```json
{
  "version": 1,
  "language": "English",
  "hideout_name": "Canal Hideout",
  "hideout_hash": 60415,
  "doodads": { ... }
}
```

| Field           | Type   | Notes |
|-----------------|--------|-------|
| `version`       | int    | Format version. `1` observed. |
| `language`      | string | Client language the names are in. Cosmetic. |
| `hideout_name`  | string | Display name of the base hideout. |
| `hideout_hash`  | int    | Identifies the base hideout **type**. Import is type-locked: a file only loads into the matching base. |
| `doodads`       | object | Placed objects. **See the duplicate-key warning below.** |

## `doodads`

Serialized as a JSON *object* keyed by decoration display name, but it is
**really an ordered list**: the same name appears many times as a repeated key.

> ⚠️ **CRITICAL:** `doodads` contains **duplicate keys**. In the sample there
> are **221** entries but only **49** distinct names (`Maraketh Fire Pot` ×27,
> `Forest Fern` ×23, …). A naive `JSON.parse` / `json.loads` **silently
> collapses these to the last value per name**, destroying ~78% of the layout.
> You MUST parse and write preserving order and duplicates (parse to an array
> of key/value pairs, not a map). Order is likely significant for draw/layering.

Each doodad value has a fixed 5-field schema, always in this key order:

```json
"Forest Fern": { "hash": 145306441, "x": 712, "y": 538, "r": 0, "fv": 0 }
```

| Field  | Type | Meaning | Encoding / range (observed) |
|--------|------|---------|------------------------------|
| `hash` | uint32 | Decoration **type** identity — the stable key. References a row in the game's `HideoutDoodads.dat` (inside `Content.ggpk`). | 12,969,733 – 4,294,658,310 (fits uint32) |
| `x`    | int  | Grid X position. | 331–1019 across bases |
| `y`    | int  | Grid Y position. | 251–865 across bases |
| `r`    | uint16 | Rotation around vertical axis. | `degrees = r / 65536 * 360`. e.g. `65354→359.00°`, `31858→175.00°`. Snaps cleanly to whole degrees. `0`–`65535`. |
| `fv`   | uint8 | **Bit-packed flip + variation.** `variation = fv & 0x7F` (0–21 seen); `flip = (fv & 0x80) != 0`. Confirmed: values `128,130,132,133` = flip + variation `0,2,4,5`; matches legacy `Flip`(0/1)+`Var` split. | 0–21, plus 128/130/132/133 |

### Notes

- **`hash` is the identity, name is a mutable label.** Across patch versions the
  *same hash* can carry *different names*: hash `1023253651` appears as both
  `Zelina` (0.3) and `Atalui, Blood Priestess` (0.4); `2204408127` as `Zolin`
  and `Ketzuli, Architect of Time`. A catalog/editor must key on `hash`, not
  name, and treat the file's name string as a display hint only.
- **Interactive objects are NOT special.** Stash, Waypoint, Map Device, crafting
  benches (Reforging/Salvage), Relic Locker, and NPC masters use the exact same
  5-field schema as ordinary decorations, distinguished only by well-known fixed
  hashes. ⚠️ Community note: the client historically saves interactive-object
  positions *differently* and may **not apply them on import** — the known
  workaround is to re-import and nudge each with arrow keys. Verify in PoE2.
- **No `scale` / `z` / height field** in version 1.
- `hideout_hash` (base/room type) and per-doodad `hash` are unrelated namespaces.
- Each base has its own valid grid extent (e.g. Vastiri Plains is small; Canal /
  Dreadnought are large). There is no grid metadata in the file itself.

## Open questions (need in-game / GGPK verification)

1. Coordinate system — grid origin, cell size, and full valid range **per base**
   (each base differs; not stored in the file). Best source: the game's
   `Hideouts.dat`.
2. Does doodad order affect render/z-order, or is it purely insertion order?
3. Exact `hash` algorithm (FNV/murmur of the metadata path vs arbitrary id). Not
   needed to edit files, but needed to map new decorations without a sample.
4. Any other top-level fields (music, lighting/environment) in files that use
   those features? None of the 10 samples had any.
5. Confirm the interactive-object import quirk still applies in PoE2.

*Resolved by sampling:* `fv` bit layout (flip=0x80, variation=0x7F); hash↔name
is many-versions-to-one (hash stable, name drifts); BOM always present; schema
uniform.

## Reference data built from samples

- `data/decoration-catalog.json` — 86 distinct doodad `hash → canonical name`
  entries harvested from the samples. Grows as more files are added.
- `data/hideout-base-catalog.json` — `hideout_hash → base name`
  (`2292` Vastiri Plains, `30315` The Dreadnought, `60415` Canal, …).
- The authoritative catalog (all decorations, icons, cost, master, valid
  variation counts, footprint) lives in `HideoutDoodads.dat` / `Hideouts.dat`
  inside `Content.ggpk`; extractable with PoE2 GGPK tools
  (`juddisjudd/ggpk-tool`, PyPoE, `poe-tool-dev/dat-schema`).

## Prior-art tools

- `mas0ny1/POE-Hideout-Migration-Tool` — PoE1↔PoE2 migration; source of PoE2 samples.
- `ZubriQ/Path-of-Hideout` (C#) — modern-JSON editor; handles duplicate keys via a `DuplicateKeyComparer`.
- `l1kiru/Hideout-editor` — an existing hideout editor (ships Canal/Shrine/Summit inputs).
- `Jukkales/PoE-Hideout-Helper` (archived, PoE1) — legacy UTF‑16 parser + GGPK `.dat` extraction.

## Implications for a customizer

- Round-trip safely: read → edit → write must preserve BOM, key order, and
  duplicate keys. Model `doodads` as `List<{name, hash, x, y, r, fv}>`.
- Editing primitives map cleanly: move (`x`,`y`), rotate (`r`), pick variation
  / flip (`fv`), add/remove/duplicate entries, change base (`hideout_hash` +
  `hideout_name`) — though base changes are constrained by import type-locking.
- A decoration catalog (hash ↔ name, valid `fv` variations, footprint) is the
  main external data asset the tool will need; it can be bootstrapped by
  harvesting many community `.hideout` files.

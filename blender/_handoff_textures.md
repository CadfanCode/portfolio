# Textures and materials -- handoff

## What changed

`blender/textures.py` is new: a kit of numpy noise/pattern generators, a
Sobel height-to-normal-map function, an image packer, and three UV
projectors (box, planar, cylindrical). `blender/materials.py` is rewritten
to use it -- every material that earns one now has a real raster base
colour, roughness and/or normal map instead of a flat PBR constant, wired
through a Mapping node so the texture repeats at a stated real-world tile
size in metres.

`params.py` was not touched. Nothing needed adding to it -- every number the
texture side needed (tile sizes, plank counts, the non-slip edge margin) is
a texture-authoring choice with no existing hull/deck measurement to be
wrong against, so those live as constants next to the code that uses them,
the same way `deck.py`'s own `SEAT_DECK_MARGIN` and friends do.

## GLB size

**992 KB -> 3432 KB** (target was "stay under about 4 MB"). Geometry itself
is ~1.25 MB of that; the rest is packed image data. See "Why roughness maps
are still PNG" below before touching this further -- there is a non-obvious
trap there.

## The palette (`materials.create()` keys)

| key | what it's for | textured? |
|---|---|---|
| `gelcoat` | hull topsides, smooth deck, hatches, cockpit lids | colour flat, roughness + normal (orange peel) |
| `gelcoat_nonslip` | deck tread surfaces only -- see below | colour flat, roughness + normal (moulded diamond) |
| `antifoul` | everything below the waterline | colour flat, roughness only |
| `band` | the topside paint stripe, sail number | flat -- a painted stripe has no texture to earn |
| `glass` | windows, forehatch pane/light | flat -- meant to be a mirror |
| `spar`, `chrome`, `alloy` | mast/boom/spreaders, deck fittings, compression post | share one normal map (fine drawn/anodised grain), own colour/roughness/metallic |
| `wire`, `engine` | rigging/lifelines, outboard | flat, unchanged from the old palette |
| `sailcloth` | mainsail, genoa | colour (weave + panel seams) + normal; roughness is a flat value, see below |
| `canvas` | sailcover | flat colour, normal only (coarse weave bump) |
| `cushion` | cushions, backrests | colour (weave tint) + normal; roughness flat, see below |
| `teak` | **interior** joinery: bulkheads, galley, quarter berth, steps, table, companionway frame, shelf, locker doors | colour + roughness (varnish sheen varies with grain) + normal, 1024px |
| `teak_exterior` | **new key.** Bare, weathered teak: tiller, cockpit grating, pulpit block | colour + roughness + normal, coarser grain/wider seams than `teak` |
| `vinyl` | liner above the sole, deckhead | colour + roughness + normal (padded dimple) |
| `sole` | liner below the sole line | colour + roughness + normal |

`teak_exterior` is the one breaking change to the palette's shape: the old
version used a single `teak` for both the interior joinery and the exterior
tiller/grating/pulpit block. They are now visibly different materials
(varnished vs. weathered bare wood), so `apply()` assigns the exterior three
to `teak_exterior` instead. Anything a sibling track adds that is *exterior*
teak wants `teak_exterior`, not `teak`.

## Non-slip decking

Done geometrically, in `assign_deck` (now taking a third material argument).
A face on `deck_fwd`/`deck_aft` gets the moulded diamond pattern only if:

- its world-space normal is close enough to vertical-up (`NONSLIP_MIN_SLOPE`)
  -- excludes the coachroof shoulders, cockpit well sides, hatch surrounds;
- it isn't within `NONSLIP_EDGE_MARGIN` (90 mm) of the deck edge -- the
  smooth border a toe rail or stanchion base needs;
- it isn't over the companionway's raised panel (`_companionway_garage_half_width`,
  gated to `params.COACHROOF_START..COACHROOF_END` so `COACHROOF_HALF_WIDTH`'s
  own held end-value outside that span can't leak a smooth strip onto the
  bare foredeck).

All three read live off `deck.py`'s own functions and `params.py`'s station
bounds, never a face index or a hardcoded coordinate -- it survives the hull
or deck being re-authored the same way the pre-existing band split does.

## UV projection

`textures.ensure_uvs` is a no-op on anything that already has a UV layer, so
it's called unconditionally over every object in `apply()`. Three kinds:

- **box** (generic, per-face dominant-normal): the fallback, used for
  everything not called out below. Correct for the deck and the cabin sole
  too -- both are made almost entirely of upward-facing faces, camber and
  all, so the generic per-face projector already gives `u, v = world.x,
  world.y` there, which is exactly what a bespoke top-down one would. I did
  not write a separate function that would do the same three lines under a
  different name.
- **cylindrical**: the hull only. Unwraps around the girth (angle about a
  pole held above the sheer) and along the length (station, in metres), so
  gelcoat's fine orange-peel bump doesn't show box projection's four
  quadrant-flip seams on a curved surface.
- **planar**: the sails only. A single area-weighted-normal plane for the
  whole sheet, so the panel-seam pattern runs straight rather than picking a
  different pair of axes wherever the sail's camber nudges a face past 45
  degrees.

## Why roughness maps are still PNG (read this before adding more)

Blender's glTF exporter always synthesizes a fresh metallicRoughness texture
for anything plugged into a Principled BSDF's Roughness or Metallic input --
composited at export time, regardless of what file format the source image
was packed with. A roughness image can never come out JPEG no matter what
`textures.grey_image` is asked for; it is PNG-only, permanently. That's
documented at length in `grey_image`'s docstring. Base colour images have no
such restriction and are packed as JPEG by default (`textures.colour_image`),
which is most of where the 4 MB budget went to good use rather than to PNG
entropy. Normal maps are never asked for JPEG at all -- a compression
artefact in a height field is a wrong lighting direction, not a soft edge.

If the GLB needs to shrink further, the roughness images are the lever:
`teak_roughness` is already downsampled to 512px against the colour/normal's
1024 (see the comment there for why that's registered correctly rather than
generated fresh). The next cut would be dropping roughness textures
entirely on `vinyl` or `sole` in favour of a flat `roughness_value`, the way
`sailcloth` and `cushion` already do.

## What I left undone

- The bow-tip checkerboard visible in `bowdeck.png` (alternating band/gelcoat
  faces right at the stem) is **pre-existing**, not something I introduced --
  it's identical in a build from before this branch touched anything, and
  it's in `assign_deck`'s band-surface tolerance test, which is `deck.py`
  geometry I don't own. Worth flagging to whoever owns that file: at the
  very bow the deck edge and the band surface both converge on x=0, and the
  `tolerance=0.020` test starts misfiring face by face.
- `antifoul`, `glass`, `wire`, `band`, `engine` got only the cheapest
  treatment the brief allows ("improve as you see fit") -- flat colours, one
  with a roughness speckle. None of them is ever within a few metres of the
  camera path, so I didn't spend budget there.
- No occlusion texture anywhere; nothing in this model has geometry tight
  enough (a seam, a fold) to need one, and it's a fourth image per material
  for a look ambient occlusion from the scene lighting mostly already gives.

## Build/render cycles used

Five: first build+render to see the "before" baseline; first full texture
pass; a size-diagnosis pass (discovered the glTF exporter forces PNG on any
Roughness-linked image, and that a `bpy.data.images.new` image needs a
real-file round trip before the exporter will treat it as JPEG); a cut pass
(3432 KB, comfortably under budget); and a final formatting/render-check
pass.

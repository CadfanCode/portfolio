# Interior detail pass -- handoff

Owner's five requests, all addressed. `npm run model:verify` is 29/29 PASS,
unchanged targets -- no check was loosened to make this true. Face count went
from roughly 18-19k (exterior + plain interior) to 26.2k; the GLB grew from
992 KB to 1.21 MB. That is the cost of the bevel pass plus a dozen new small
objects, and it seemed worth it against the brief's own "this is the geometry
a visitor is closest to for longest" -- but flagging it since size was a going
concern in the README (Draco/meshopt is the lever if it ever bites, not
splitting the model).

## New objects, and the material each wants

None of these are assigned a material -- that is the parallel materials/texture
track's job, per the brief. `materials.py`'s `assign()` calls use `.get()`, so
nothing breaks with these unassigned; they will just render in Blender's
default grey until picked up.

| Object | Suggested material | Note |
|---|---|---|
| `step_grabrail` | `chrome` | Same tube idiom as `tiller`/`stanchions`. |
| `books` | new -- a cloth-bound cover tone, or two alternated per book | Currently all one mesh; if per-book colour is wanted it needs splitting, or a second `books_alt` object bevelled/joined separately. |
| `grabrails` | `teak` | Deckhead handrails, wood on every boat this size. |
| `curtains` | `canvas`, or a lighter fabric tone if one gets added | Track + gathered curtain are one mesh per side; a track-vs-fabric colour split would need the same treatment as `assign_split`. |
| `cabin_lamp` | `chrome` for the body; would benefit from an emissive tweak (a warm glow) if the glTF pipeline carries emissive through -- it is the only light fixture actually modelled below deck | -- |
| `bilge_hatch` | `teak` (fits the "ply panel with a fiddle" read) or `sole` (blends into the floor around it) -- either is defensible, teak matches the rest of the below-deck brightwork | -- |
| `washboard` | `teak` | Matches `companionway_frame`. |
| `fire_extinguisher` | needs a new material -- none in the current palette is a plausible red paint | -- |

Existing keys that changed shape but keep their current material assignment
(no action needed): `shelf` (now shelf + fiddle + end cheeks, one mesh),
`locker_doors` (now doors + hinges + finger pulls + wardrobe louvre, one mesh
-- the hinges and pulls will render in whatever the doors do, teak rather than
metal; splitting them out for a `chrome` assignment the way `assign_split`
splits the liner is the obvious next step if it looks wrong once textured),
`steps` (carcase + slatted treads, one mesh, still teak), `cushions` and
`backrests` (now crowned rather than flat-topped, still `cushion`),
`mast_post` (now with a heel fitting flange, still `alloy`), `table`,
`bulkheads`, `galley`, `quarter_berth` (bevelled, otherwise unchanged).

## Params added (all in `params.py`, in place next to what they describe)

- `TABLE_TOP` -- the saloon table's height off the sole, promoted out of a
  local literal in `joinery._build_table` so `GALLEY_TOP` could be defined
  from the same number rather than guessing at it a second time.
- `GALLEY_TOP` changed from a literal `0.300` to `TABLE_TOP` -- the owner's
  request #1, verbatim: sink and cooker now stand at table height.
- `FIDDLE_HEIGHT`, `FIDDLE_THICKNESS`, `FIDDLE_SCALLOP` -- the shelf's fiddle
  rail.
- `TREAD_THICKNESS`, `TREAD_NOSING`, `GRABRAIL_HEIGHT`, `GRABRAIL_RADIUS` --
  the rebuilt companionway steps and their grab rail.

## What each request became

**1. Galley height.** `GALLEY_TOP = TABLE_TOP` (490 mm off the sole, was 300).
Checked and fixed two knock-on effects rather than just the number:

- The port-side shelf and backrest used to run all the way to `SALOON_END`,
  over the top of the galley -- harmless with 260 mm of clearance above the
  old worktop, a collision with the tap once the worktop rose (90 mm of clear
  air left). Both now stop at `GALLEY_START` on the port side only
  (`fitout.SHELF_END`), which is also the more correct layout independent of
  the height change: a shelf over a worktop with a tap on it was never right.
- Checked the tap against the deckhead directly (a small script against the
  built `.blend`, not eyeballed): 367 mm clear at the sink station. No
  collision.
- `verify.py`'s galley/saloon headroom checks measure deckhead-to-sole, which
  the counter height does not touch -- both still pass, 1608/1600 and
  1467/1470, unchanged in kind from before this change.

**2. Shelf fiddle, cheeks, and something to restrain.** `fitout._shelf_with_fiddle`
replaces the plain `_hull_strip` call for the shelf: one lofted profile
carrying the shelf top *and* a fiddle standing up from its inner edge (the
edge facing the cabin, not the hull -- nothing has ever fallen off a boat
through its own topsides), with a shallow sine wave in the fiddle's top edge
for the scalloped/slotted look. The strip's own `cap_loop` ends -- the same
close every strip here gets -- become genuine end cheeks this way, full
height from the shelf's underside to the fiddle's top, rather than the
shelf's own 14 mm edge. Four books (`fitout._build_books`) sit on the
starboard shelf, propped against the fiddle -- one side only, deliberately,
so a shelf does not become a bookcase.

**3. Steps.** `joinery._build_steps` rebuilt: the carcase (still nested boxes,
still doubling as the drawer fronts the brochure describes) now stops
`TREAD_NOSING` short of the tread above it and `TREAD_THICKNESS` below it; a
separate tread slab reaches the rest of the way to the front. That overhang
is the nosing, and it is also the visible gap the brief asked for -- the
nosed-out lip has nothing beneath it but the tread one riser down. Each tread
is three teak slats with an 8 mm gap rather than one slab, for the non-slip
surface (same reasoning as `fittings.cockpit_grating`). A chrome-tube grab
rail (`joinery._build_step_grabrail`, its own object so it can take a
different material from the wood) stands across the front of the top step.

**4. Bevel.** `lib.mesh.bevel()` applied to every object built in
`interior.py`, `joinery.py` and `fitout.py`. Segment counts were chosen
against the total: 2 segments on the handful of large, close, or genuinely
prominent pieces (the liner, the table, the galley block, the steps, the
cushions, the gathered curtain); 1 segment -- a single flat chamfer, still
enough to catch a highlight -- on the many small fittings (sink, tap, cooker,
hinges, pulls, louvre slats, bilge hatch trim), because a rounded two-segment
bevel on a dozen tiny boxes was the single biggest lever on face count when
this was first built (27.4k faces before tuning, 26.2k after). Round objects
(burners, the tap, the mast post's shaft, the cabin lamp, the fire
extinguisher, both grab rails) are explicitly excluded (`bevel_width=None`) --
bevelling a cylinder's own facets chamfers the curve it exists to fake.

**5. Fine detail.** Picked for the three interior camera stops rather than for
completeness -- see the module-level comment in `fitout.py` for the same
argument `fittings.py` makes about the cockpit. Built: deckhead grab rails
flanking the mast post over the table; hinges, a finger pull, and a louvred
door on the wardrobe (`params.WARDROBE_SIDE`) among the locker doors;
gathered curtains and their tracks at both saloon windows (`params.WINDOWS`);
a single deckhead cabin lamp over the table; a proud bilge hatch with a
fiddle border and a raised pull, between the table and the galley; the
companionway washboard, in place, built on the same lean the doorway itself
is cut on (`deck.companionway_lean`); a mast post heel fitting; a fire
extinguisher on the aft bulkhead; and the cushion/backrest crown described
above.

**Left undone.** Trim fillets where joinery meets the liner -- the last item
on the owner's list. Not built: every junction (both bulkheads against the
hull, the shelf ends against the hull, the galley block against the hull) is
a different profile, so a fillet is not one function called several times, it
is bespoke geometry at each seam, and the bevel pass already does most of the
same job (it is what softens exactly those transitions from the liner's own
side). Judged not worth its face count against what it would add on top of
the bevel.

## Things worth checking once textures land

- `books` and `curtains` are each one mesh per group; if per-object colour
  variation is wanted (different book covers, track vs. fabric), they will
  need splitting or a face-index material the way `assign_split` handles the
  liner's sole/vinyl line.
- `locker_doors` carries the hinges and finger pulls as part of the same mesh
  as the doors and the wardrobe's louvre, so they will come out in whatever
  material the doors get (teak). Chrome hinges would read better; splitting
  them into their own returned object is the straightforward follow-up if it
  looks wrong once lit.

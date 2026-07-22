# Exterior track handoff

Branch `detail/exterior`, worktree `portfolio-wt-exterior`. Scope: `fittings.py`,
`sails.py`, `rig.py`, `deck.py`, plus surgical edits to `params.py`.
`npm run model:verify` is 29/29 PASS, no targets changed.

## What changed, by brief item

1. **Sail number moved to the mainsail.** `SAIL_NUMBER` is now `"SWE 2875"`,
   `SAIL_NUMBER_HEIGHT` is 300 mm (was 250 on the genoa). `sails._build_mainsail`
   now returns its surface function alongside the mesh, the same way the genoa
   already did, and the number is laid on it via the existing mechanism.
   `NUMBER_ANCHOR` moved to `(0.42, 0.62)` -- above mid-height, forward of the
   leech/roach. Comments in both `params.py` and `sails.py` are rewritten to
   argue the correct way round (mainsail carries identity on a masthead rig).

2. **Outboard rebuilt.** `fittings._build_outboard` now builds: a cowling with
   a moulded parting line, side vents, a carry handle and a pull-start boss
   (`_build_cowling`); a folded steering/throttle arm with a twist grip, swung
   *outboard* (away from the centreline) so it can never approach the rudder
   clearance the verify check measures (`_build_tiller_arm`); the leg, gearcase
   and anti-cavitation plate (kept from the old build, the plate just renamed
   to say what it is); a skeg, kept shallower than the propeller's lowest point
   on purpose -- see that function's docstring for why; the three-bladed prop
   (unchanged); a transom clamp with two screw handles and a tilt pivot pin.
   A separate object, `outboard_fuel`, is a portable tank on the cockpit sole
   near the transom with a line run up to the powerhead. Both propeller/rudder
   verify checks still pass at essentially their old measured values (90.3 mm,
   273.9 mm) because none of this touched `OUTBOARD_OFFSET`, `_outboard_layout`'s
   case_z/case_tail, or the propeller function.

3. **Rope.** Running rigging in `rig.py`: main and genoa halyards down to a
   pair of deck clutches just abaft the mast (their coiled tails hang facing
   aft, so they read from the cockpit stop), a topping lift with a slight sag
   (it's slack once the main takes the boom's weight), and a taut kicker/vang.
   A `gooseneck` fitting, `spreader_boots`, and a `masthead_unit` (sheave box,
   windex, VHF whip) were added alongside. In `fittings.py`: a taut mainsheet
   from the boom through the traveller car to a cleat with a flemished tail,
   and a taut genoa sheet from the clew through a new port-side `genoa_track`
   car to the port after winch, tail flemished on the sole. On the sails
   (`sails.py`): a headboard, four battens in their pockets (mainsail only),
   cringles at head/tack/clew on both sails, and a boltrope up each luff.
   Left undone: luff slides on the mast track, reef pennants, leech line, sail
   ties -- all lower-visibility than what's here and cut for budget.

4. **Bevel.** Applied via `lib.mesh.bevel` to: in `rig.py`, the mast, boom,
   spreaders, gooseneck and masthead unit; in `deck.py`, the companionway
   frame, cockpit lids, anchorbox lid and forehatch frame; in `fittings.py`,
   the traveller, outboard, pulpit block, winch handle, mast clutches, mooring
   cleats, anchor, boarding ladder, nav lights and genoa track. Swept tubes
   (rails, wires, rope) are left alone -- already round, nothing for a bevel
   to find. `deck_fwd`/`deck_aft` themselves are deliberately *not* beveled:
   their few genuinely sharp lines are moulding creases the mesh was built to
   hold via `shade_smooth`'s angle threshold, and beveling every qualifying
   edge on the model's second-largest mesh buys nothing extra. Face count
   stayed sane -- GLB grew from 992 KB to 1.39 MB build-artifact-side (the
   equivalent binary was ~786 KB per the README's older figure), which is
   mostly the new rope and hardware, not the bevels.

5. **Deck imagination, weighted to the cockpit.** Added: mooring cleats (bow
   and stern pairs), a winch handle in a pocket on the coaming (one only, port
   after winch), halyard clutches at the mast foot, a plow anchor with chain at
   the pulpit, a boarding ladder on the port quarter (clear of the outboard's
   starboard quarter), port/starboard/stern nav lights, and the genoa track and
   car mentioned above. Left off the candidate list: bulkhead compass and
   bilge pump (no clean surface to mount either without deeper changes to
   `deck.py`'s cockpit section than the brief's "add, don't re-plumb" rule
   allows), and an ensign staff (cut for budget, lowest-value item on the
   list).

## New objects and the material each wants

From `sails.py`:
- `mainsail_headboard` -- white/off-white rigid plastic, slight gloss.
- `mainsail_battens` -- white or grey fibreglass rod.
- `sail_cringles` -- brass or stainless ring, small and bright.
- `boltropes` -- off-white braided rope, matte.

From `rig.py`:
- `gooseneck` -- cast stainless or bronze fitting.
- `spreader_boots` -- black rubber.
- `masthead_unit` -- box: grey alloy/plastic sheave box; the windex is a
  separate visual element within it (white or red vane) if the material
  system can select by vertex position/sub-mesh, otherwise one plastic
  material for the lot; the VHF whip reads as black fibreglass rod.
- `running_rigging` -- rope: halyards, coils, topping lift and vang are one
  merged object, so one rope material/colour for all of it. Real halyards are
  often a different colour from sheets; if that distinction matters more than
  the merge, say so and I'll split it before the next pass.

From `fittings.py`:
- `winch_handle` -- pocket in black or grey plastic, handle shaft and grip in
  chrome/stainless with a black rubber grip sleeve if the material system
  supports two materials per object (it's currently one merged mesh).
- `outboard_fuel` -- tank in red or black moulded plastic, hose in black
  rubber. Merged into one object.
- `mast_clutches` -- black plastic clutch bodies.
- `mooring_cleats` -- polished stainless or white nylon casting.
- `anchor` -- galvanised or matte black steel, shank/blade and chain alike.
- `boarding_ladder` -- stainless steel tube.
- `nav_lights` -- ideally port (red), starboard (green) and stern (white)
  lenses; it's three boxes merged into one object, in that order if the
  material system assigns by sub-mesh/material-slot, otherwise a neutral
  chrome-and-white housing colour for all three.
- `genoa_track` -- anodised aluminium rail, black or grey plastic car.
- `sheets` -- mainsheet and genoa sheet plus their flemished tails, merged;
  rope, probably a different fleck/colour from the standing rigging's wire
  and ideally distinct from `running_rigging`'s halyard rope too, but that's
  a call for whoever owns colour, not geometry.
- `outboard` -- rebuilt, still one merged object as before: cowling, clamp,
  leg, gearcase, prop, skeg, tiller arm, all of it. A grey/white moulded
  plastic look for the cowling and clamp with a darker gunmetal leg/gearcase
  reads right if the material system can vary by height; one uniform grey
  works too, it just won't show the cowling-vs-metal-leg distinction a real
  motor has.

## Params changed

- `SAIL_NUMBER`: `"SWE 1234"` -> `"SWE 2875"`.
- `SAIL_NUMBER_HEIGHT`: `0.250` -> `0.300`.

Both edited in place, with rewritten prose explaining why a mainsail carries
the number rather than the genoa. No other `params.py` edits -- everything
else new lives as local constants in the four files I own, following the
precedent `fittings.GUARDRAIL_MIN_HALF_WIDTH` already set, specifically so a
sibling merging `params.py` from another branch has nothing of mine to
collide with outside that one block.

## New public functions (additive only, no existing signatures touched)

- `deck.coachroof_half_width(station)` -- half-width of the coachroof top, for
  the genoa track to ask where the side deck it lives on actually is.
- `rig.boom_point(g, t)` -- a point along the boom's centreline at fraction
  `t`; used by the mainsheet and the vang so both answer to the same spar.
- `rig.layout()` gained three new keys: `clutch_station`, `clutch_half_beam`,
  `clutch_z` -- where the halyard clutches sit, read by both `rig.py` (to
  terminate the halyards) and `fittings.py` (to build the hardware).
- `sails.genoa_tack(g)` / `sails.genoa_clew(g)` -- pulled out of
  `_build_genoa` and made public so `fittings.py`'s genoa sheet starts exactly
  where the sail does.
- `fittings.genoa_car_x(station)` / `fittings.genoa_car_point()` -- where the
  genoa track/car sit, for anything else that needs to agree with the sheet.
- `fittings._outboard_layout()` -- the geometry `_build_outboard` used to
  compute inline, now shared with `_build_outboard_fuel` so the fuel line
  can't drift from the powerhead it feeds.

## Left undone / worth a look

- The mainsail number's underlying text is correct (`SWE 2875`, verified in
  code and in the object list) but the preview renders show it ghosting --
  two faint overlapping copies. This is not new: the original genoa number did
  the same thing at a smaller scale. It's a consequence of the sail being a
  single zero-thickness sheet with text 4 mm off *both* faces and no backface
  culling in the preview material (`sails.py`'s own module docstring notes
  this is deliberate for three.js). It should resolve, or at least soften,
  once the material pass gives the sail an opaque/backface-culled shader --
  nothing to fix in geometry.
- Luff slides, reef pennants, leech line, sail ties, an ensign staff, a
  bulkhead compass and a bilge pump were all candidates I did not build --
  see the per-item notes above for why each was cut.
- The genoa track carries one car, at the trim position for this scene, not
  an adjustable range -- deliberate, see `fittings.py`'s `GENOA_TRACK_STATION`
  note.
- GLB grew from 992 KB to 1.39 MB. Still small in absolute terms, but if it
  becomes a problem the README's answer is mesh compression (Draco/meshopt),
  not splitting the asset.

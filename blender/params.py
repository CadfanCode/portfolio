"""
Every dimension of the Maxi 77, in one place.

This file is the source of truth for the model. Geometry is generated from it,
and `verify.py` measures the result back against it. Nothing here is guessed
without saying so: values carry either a class-rule reference or a note about
where they came from.

Primary source
--------------
Svenska Seglarforbundet, "Klassregler for Maxi 77", 2001-03-01. Rule references
below are to that document (C.2.2, D.3.2, ...). Those numbers are *measured*
dimensions with tolerances, taken by a licensed measurer, which makes them far
better evidence than brochure figures.

Where the rules give a range or a maximum, we take the value a real boat would
land on rather than the bound itself, and note the choice.

Fitted values (marked FITTED) have no published source. They are shaped against
reference photographs and adjusted through the render loop. Those are the
knobs to turn when the boat looks wrong.

Units and axes
--------------
Metres throughout. Blender axes: +X starboard, +Y forward (bow), +Z up.
Waterline sits at z = 0, the origin is amidships on the centreline. The glTF
exporter maps this to three.js as x -> x, z -> y, -y -> z, which puts the bow
at -Z, matching the camera stops the app already uses.

Stations are measured as distance aft of the stem point, so s = 0 at the bow
and s = LOA at the transom. `station_to_y()` converts.
"""

# --- Model identity -------------------------------------------------------

MODEL_YEAR = 1980
"""The boat was substantially revised in 1975: new deck with a forward sail
box, deck raised, cabin sole lowered, coachroof extended aft. A 1980 hull is
the post-1975 deck, past hull #699, so it also has the moulded inner liner."""


# --- Hull envelope --------------------------------------------------------

LOA = 7.615
"""Hull length excluding rudder, including rubrail. Rule D.3.2: 7615 +/- 20 mm."""

BEAM_STATION = 4.850
"""The station the class rules measure beam at, aft of the stem point. D.3.2."""

BEAM_AT_STATION = 2.510
"""Beam including rubrail at BEAM_STATION. Rule D.3.2: 2510 +/- 20 mm.

The rules do not say this is maximum beam, only that it is where beam is
measured. The brochure's overhead photograph (refs p3) puts the widest point at
roughly 64% aft, which is this station -- so it is treated as the maximum, which
is also the obvious thing for a one-design control measurement to be."""

TRANSOM_RAKE = 10.0
"""Degrees from vertical, top aft. Measured off the brochure profile drawing:
the transom falls 53 px over 305 px of height, giving about 10 degrees.

This is why the hull is 7615 mm long at the rubrail but shorter at the
waterline, and it is what makes the LWL come out right."""

LWL = 6.751
"""Waterline length. Published as 22.15 ft; no class rule covers it.

Not a shape parameter -- it falls out of PROFILE, where the centreline crosses
z = 0 at each end. It is here so `verify.py` can check that it does, which is
what pins the overhangs."""

DRAFT = 1.450
"""Rule C.5.1: 1450 +/- 25 mm, waterline to the lowest point of the keel."""

DISPLACEMENT = 2000.0
"""kg. Rule C.3.1 minimum, and the published figure (4409 lb) agrees."""

SEAWATER_DENSITY = 1025.0
"""kg/m3, Baltic-to-North-Sea. Sets the submerged volume the hull must have."""

FREEBOARD_BOW = 0.980
"""Waterline to top of rubrail at the stem. Rule C.2.2 gives this as a maximum;
measured at minimum weight, a real boat sits at essentially this figure."""

FREEBOARD_STERN = 0.720
"""Same, averaged across the two transom corners. Rule C.2.3, as a maximum."""

RUBRAIL_PROUD = 0.022
"""How far the rubrail stands outboard of the hull skin. FITTED -- the rules
include the rail in both length and beam but never dimension it separately."""


# --- Ballast --------------------------------------------------------------

TOTAL_WEIGHT = 2000.0
"""Minimum total weight, rule C.3.1. Not used geometrically; recorded because
it is what the freeboard figures are measured at."""

KEEL_WEIGHT = 800.0
"""Rule E.2.2: 800 +/- 25 kg, iron. Used to sanity-check the fin's volume."""


# --- Deck and cockpit -----------------------------------------------------

COCKPIT_LENGTH = 2.300
COCKPIT_WIDTH = 2.000
"""Factory brochure, p3: "Den mater 2,30 x 2 m." The only published cockpit
dimension anywhere, and a large cockpit was one of the boat's selling points.

At 2.0 m the cockpit is nearly the full beam that far aft, which is right: the
brochure has 6 people sitting in it and 8-9 round a table, and praises the high
coaming you lean back against. There are no side decks alongside it."""

COCKPIT_START = 5.160
COCKPIT_END = COCKPIT_START + COCKPIT_LENGTH
"""Scaled off the brochure's overhead photograph: the well reads from station
5160 to 7490. That is 2330 mm long, against the 2300 mm the same brochure
states in text -- two independent readings of the same document agreeing to
30 mm, which is as good as this kind of measurement gets."""

COCKPIT_SOLE_BELOW_SHEER = 0.640
COCKPIT_SEAT_BELOW_SHEER = 0.400
"""Sole and seat tops, measured down from the sheer. FITTED so that a seated
adult's eye lands where the cockpit camera stop needs it."""

COCKPIT_SEAT_WIDTH = 0.420
"""Width of the seat top. The well side then rises from its outboard end to
meet the side deck flush.

No raised coaming, though the brochure sells one -- "den hoga sargen" you lean
back against. Modelled as a rise on a zero-thickness section it came out as a
blade rather than a coaming; it needs a section of its own before it earns a
number here."""

DECK_STEP_APEX = 2.770
"""Where the step in the deck reaches furthest forward: the nose of the chevron,
on the centreline.

3250 - 480. The riser in CABIN_BAND tops out at station 3250, and
DECK_STEP_SWEEP carries the same riser 480 mm further forward on the centreline
than at the deck edge. Written out rather than computed from those two, because
both of them are below this in the file and neither is going to move without
this being looked at anyway.

This is the landmark everything on top of the deck is hung from: the coachroof
starts here and the raised panel over the companionway starts here, so all three
noses -- step, roof, panel -- are the same point, and the superstructure reads as
one wedge growing forward out of the deck rather than as things set down on it."""

COACHROOF_START = DECK_STEP_APEX
COACHROOF_END = COCKPIT_START
"""The coachroof runs from the foredeck back to the cockpit. Cross-check: the
mast steps on the coachroof (F.7.1) at station 3450, which lands comfortably
inside this span. If the coachroof were placed wrongly, that would not hold.

It used to start at 3100, which was "just abaft the step" read off the drawing
at the deck edge. But the step is a chevron: at the deck edge is exactly where
it reaches furthest aft, and the roof was being started 330 mm behind its own
nose. Everything between the two ended up flat -- a dead level shelf between the
step and the coachroof, with the rise resuming after it, which is the bump the
profile showed most clearly."""

COACHROOF_HALF_WIDTH = [
    # Half-width of the coachroof *top*. Tapers hard over its forward third and
    # then runs parallel, which is what makes the shape read as angular rather
    # than as a blister. An earlier, more elliptical version of this curve
    # turned it into a rounded blob and lost the "djarva formen" the brochure
    # sells.
    #
    # Narrowed from a 720 mm after body once the sides were given a real slope:
    # the width that used to be roof is now the chamfer plus side deck, which is
    # what the bow-on photograph shows -- a narrow plateau on a broad wedge,
    # with the wide side decks the boat is known for either side of it.
    #
    # The lead-in point is not a shape: it is there so the curve leaves the
    # coachroof's forward end flat. Fritsch-Carlson zeroes the tangent at any
    # point with a flat run beside it, and without one the width came off its
    # start value at full tilt while the roof was still rising out of the deck,
    # which put a visible hook in the edge of the nose.
    (2.500, 0.400),
    (COACHROOF_START, 0.400),
    (3.300, 0.500),
    (3.700, 0.560),
    (4.200, 0.590),
    (4.700, 0.600),
    (COACHROOF_END, 0.600),
]

COACHROOF_NOSE_FADE = 0.900
"""Over how much of its forward end the coachroof takes on its own camber.

The roof does not start at a wall. It grows out of the raised deck just abaft
the step, which is what makes the two read as one moulding -- and what the
brochure's "djarva formen" is: a wedge, not a box set down on a deck.

This used to fade the roof's *height* in as well, and that was the swelling on
the nose: see COACHROOF_HEIGHT, which now starts at zero and needs no help. What
is left for the fade is the flatter camber the roof carries, which does have to
be eased in -- switched on at a station it folds the surface along the roof's
half-width. Stretched from 260 mm to nearly a metre while it was being taken off
the height, because a camber blend has no reason to be brief and this one was
the last measurable ripple left in the centreline."""

COACHROOF_SIDE_FLARE = 0.075
"""How far the coachroof side leans out between its top edge and the side deck.

Against the 130 mm of height aft, that is a face at about 60 degrees: steep
enough to read as a wall from across the water, sloped enough to catch a
highlight along its whole length and show which way the light is coming from.
The 30 mm it replaced was a tumblehome, not a side -- it existed only to keep
the top edge off a knife edge."""

COACHROOF_HEIGHT = [
    # Height above the deck at the coachroof's own base, on the centreline.
    #
    # Measured off the trailer side elevation, which is the only true profile
    # here: the coachroof top stands about 173 mm above the deck edge at the
    # after end, of which some 45 mm is the deck's own camber getting there.
    #
    # A straight run between those two measured ends. It used to reach 85 mm by
    # station 3400 and then crawl the rest of the way, which put three quarters
    # of the rise into the first sixth of the length: a knee at the nose you
    # could see from anywhere off the bow, and a top that went flat behind it.
    # Nothing was measured at 3400 -- only the ends are -- so the intermediate
    # points were shape, and the shape they made was a bump.
    #
    # Zero at the forward end, not 12 mm, and rising from the step's apex with
    # no lead-in and no easing. The roof's height used to be faded in by
    # COACHROOF_NOSE_FADE on top of this, and a curve that starts at a height
    # multiplied by a fade that starts at zero gives a rise that starts at zero
    # either way -- but with a gradient that peaks in the middle of the fade and
    # then falls back, which is a swelling on the nose. Starting the curve at
    # zero lets the fade come off the height entirely.
    #
    # A flat lead-in was tried here, as COACHROOF_HALF_WIDTH has, and it is
    # wrong for a height: zeroing the tangent means the rise has to make the
    # time up later, and a shape-preserving spline does that by overshooting the
    # average gradient by a third in the middle. The roof does not need easing
    # off the deck, because at its forward end it has no height to ease off --
    # what it needs is to leave from the same point the deck step ends at, which
    # is what starting at the apex does.
    (COACHROOF_START, 0.000),
    (4.000, 0.065),
    (COACHROOF_END, 0.130),
]
"""A low crown on top of the raised deck, not a trunk standing on a flat one.

Twice reduced early on, and for the same reason both times: height that was
being asked of the coachroof actually belonged to the deck underneath it. First
CABIN_BAND was missing, then the step in it was. Once both were there the
remainder was measured rather than guessed, and came out taller than the 86 mm
that was left standing after those two corrections -- the deck below is right
now, so the swelling above it can have its real height back."""

COMPANIONWAY_RAISE_FORWARD = DECK_STEP_APEX
"""Where the raised section over the companionway runs out forward: the apex of
the deck step, the same point the coachroof under it starts from.

It used to stop at the mast (3450), where it faded to nothing. That left the
panel ending in mid-coachroof against no line in particular. Run forward to the
apex instead it finishes on the one line that is already there -- the nose of
the chevron."""

COMPANIONWAY_RAISE = [
    # How far the raised section over the companionway stands above the deck or
    # coachroof around it: nothing at the step's apex, full at the after end
    # where the hatch garage and the way below need the height.
    #
    # One straight ramp between those, and it has to stay one. Every earlier
    # version put the rise where the accommodation wanted it -- flat to the mast,
    # then hard up over the saloon, then easing off again -- and the eye reads
    # that as three separate swellings rather than as one slope. A constant
    # gradient is the only version of this that looks like a single moulding.
    #
    # It reaches zero rather than standing 50 mm proud at the apex: the panel is
    # swept out along the same chevron as the deck step below it (see
    # DECK_STEP_SWEEP), so a non-zero value here is not a nose, it is a 50 mm
    # cliff across the front of one.
    (COMPANIONWAY_RAISE_FORWARD, 0.000),
    (4.000, 0.116),
    (COACHROOF_END, 0.226),
]
"""The second tier: a flat-topped centre panel standing above the coachroof,
with a shoulder sloping down to the coachroof either side of it.

This is what makes the after end of the cabin top read as a structure rather
than a swelling -- it is the part you look straight at from the cockpit stop,
and the only part of the deck the camera path ever gets close to."""

COMPANIONWAY_RAISE_WIDTH = 2 / 3
COMPANIONWAY_RAISE_WIDTH_FORWARD = 0.500
"""Half-width of that flat top, as a fraction of the coachroof's own half-width:
full at the after end, a quarter narrower by the time it reaches the step apex.

A fraction rather than a dimension so the shoulder either side never runs out of
room: the coachroof narrows to 400 mm at its nose, and an absolute centre panel
of about that width would leave the shoulder nothing to slope over and collapse
three of the section's points onto one another.

The taper is on top of that. Held parallel, the panel followed the coachroof's
own widening and read as a second hull line running alongside the first; taken
in a quarter as it runs forward it reads as one wedge instead, converging on the
apex the same way the deck step below it does. The two effects compound -- 400
mm of half-width aft against 200 mm at the apex -- which is the point."""

DECK_STEP_SWEEP = 0.480
"""How much further aft the step in the deck falls at the deck edge than it
does on the centreline.

The riser is not square across the boat. It is a chevron with its apex on the
centreline, so the raised deck noses forward into the foredeck -- the shape that
reads as a prow in the bow-on photograph, and the reason the coachroof looks
like it is growing out of the deck rather than sitting on it. Outboard the two
arms sweep aft until they run into the step in the topside band at the sheer,
which is where CABIN_BAND puts it and is unaffected by this."""

# --- The topside band -----------------------------------------------------
#
# The thing that makes a Maxi look like a Maxi, and the thing this model got
# wrong first time round.
#
# The deck does not sit on the sheer. The hull ends at the rubrail -- which is
# the hull/deck joint, and the datum the class rules call "spranglinjen
# (overkant avbararlist)" -- and the deck moulding then rises off it as a
# narrow, near-vertical band before going flat. The cabin windows are let into
# that band, long and low, just above the hull.
#
# It reads as a painted stripe in the brochure's line drawing, which is how it
# was first misread here. It is not: the brochure describes the blue gelcoat as
# the colour "som naturligt delar av skrov och dack" -- that naturally divides
# hull from deck -- and there is a real step there for it to divide. Getting the
# cabin volume from this band instead of from a tall coachroof is what lets the
# deck stay flat, which is the whole look: "sitt hoga slata dack".

CABIN_BAND = [
    # Rubrail to deck edge, forward of the cockpit.
    #
    # The deck does not rise smoothly: it *steps*. Forward of station 3050 --
    # about 400 mm ahead of the mast -- there is a low flat foredeck with a
    # shallow band. Aft of it the whole deck sits some 120 mm higher on a much
    # deeper band, which is what carries the windows and gives the cabin its
    # height. The riser between them is short and sloped.
    #
    # Measured off a photograph of a boat ashore on a trailer, which is the only
    # reference here that shows a true side elevation. The band reads about
    # 91 mm just forward of the step and 198 mm just aft of it.
    #
    # This replaced a smooth bow-to-stern taper. That taper had a tidy story --
    # it made the deck line exactly level, cancelling the 260 mm the rubrail
    # falls between the class-rule freeboards -- and it was wrong. The real boat
    # gets a level deck *aft of the step* and lets the foredeck line sweep up
    # towards the bow, which is a different and better-looking thing.
    (0.000, 0.048),
    (0.890, 0.057),
    (2.110, 0.081),
    (2.920, 0.091),
    (3.080, 0.140),
    (3.250, 0.198),
    (4.000, 0.206),
    (5.160, 0.212),
]

AFT_BAND = 0.095
"""Same band aft of the cockpit bulkhead, where it drops to a coaming. The
drawing shows the step clearly, at station 5470 -- within 300 mm of where the
cockpit was independently placed off the overhead photograph."""

BAND_TUMBLE = 0.014
"""How far the deck edge sits inboard of the rubrail. The band leans in
slightly, as a moulded topside does."""

WINDOWS = [
    # (forward station, aft station) of each side window, scaled off the
    # drawing. Two per side: a long one over the saloon, a shorter one forward.
    (4.190, 5.090),
    (3.430, 4.070),
]

WINDOW_MARGIN_TOP = 0.035
WINDOW_MARGIN_BOTTOM = 0.030
"""The window fills the band between these margins, so it tapers with it --
taller over the saloon, shorter forward. A fixed height would hang below the
rubrail at the forward end, where the band is only 165 mm deep."""
WINDOW_PROUD = 0.007
WINDOW_THICKNESS = 0.0065
"""Smoked 6.5 mm acrylic, bonded to the *outside* of the band and through-bolted
-- brochure p2, "Sakerhetsrutorna": "Dom ligger hart fastlimmade pa utsidan av
skrovet och sakrade med ordentliga bultar."

Proud, not inset. An inset panel with no opening cut behind it is simply hidden
by the band in front of it, which is exactly what happened on the first
attempt: the windows were built, and invisible."""

DECK_CAMBER = 0.065
"""Crown at the centreline, over the full beam. Sheds water and stiffens the
moulding; also the reason a foredeck reads as a surface rather than a plate."""

COMPANIONWAY_WIDTH = 0.560
"""The way below, cut through the aft face of the coachroof.

A real opening, not a recess. It used to be modelled as a 520 mm well sunk into
the coachroof's aft face, on the argument that from a fixed camera path nobody
ever goes through it -- and that was wrong twice over. The camera path routes
cockpit -> cabin, so the camera goes through this hole; and the recess was
behind an unbroken lofted skin anyway, so it never showed at all.

Cutting it means the aft face can no longer be a `cap_loop` over the deck
section: it is now built as its own panel with a hole in it. See
`_build_companionway`."""

COMPANIONWAY_HEAD_DROP = 0.085
"""How far the head of the opening sits below the deckhead.

Enough for a beam over the top of it and nothing more -- headroom in a
companionway is the one place on a small boat you cannot spare any. But it does
have to clear the frame as well as the opening: at 35 mm the head landed 2 mm
under the coachroof, and the teak surround came out of the top of the roof
rather than sitting in the face of it."""

COMPANIONWAY_FRAME_WIDTH = 0.055
COMPANIONWAY_FRAME_PROUD = 0.016
"""The teak surround. Every boat of this era has one: it is what the washboards
slide in, and it is what takes the wear from people climbing through. It is
also the only teak visible from the cockpit, which is what makes the opening
read as a doorway rather than as a hole in a moulding."""

COMPANIONWAY_LEAN = 0.200
"""How far forward the aft face of the coachroof leans, per metre of height.
About 11 degrees, measured from the companionway sill.

The face is not a wall. It leans towards the bow -- doorway, teak surround and
the moulded cheeks either side of it, all on one plane -- which is what stops
the after end of the coachroof reading as a box with a hole in it. The 1975
revision names the same feature from the other side: "Ruffskottet flyttas
akterut med mindre lutning", the cabin bulkhead moved aft *with less slope*, so
the slope is a thing the boat has and the revision only reduced it.

Applied as a shear on z rather than as a rotation of a panel, so everything
that meets the face -- the deck moulding either side, the doorway, the frame --
lands on the same plane without any of them being told about the others. See
`deck.companionway_lean`."""

COMPANIONWAY_LEAN_START = 3.700
"""Where the lean fades in from, running aft.

It has to fade in over a long run, and this is the first station aft of every
fitting that is placed by station rather than by the deck: the mast at 3450 and
the chainplates at 3600 are both forward of it, so the rig never has to know
the shear exists. Fading it over the remaining 1460 mm keeps the steepest
station compression at about 13%, which the coachroof -- a straight ramp over
that whole length -- does not show at all. Fading it faster does show: at
500 mm it puts a brow across the after end of the roof."""


# --- Cockpit seating ------------------------------------------------------

COCKPIT_FOOTWELL_START = 5.380
COCKPIT_FOOTWELL_END = 7.020
"""The footwell: the part of the cockpit sole that is actually down at sole
level. Forward and aft of it the sole comes up to seat height, which is what
makes those two ends benches -- so the seating runs right round the well
instead of stopping at two side benches.

The brochure sells the cockpit on exactly that: "inte manga batar i den har
storleksklassen som klarar av att ha 8-9 vuxna personer runt ett bord i
sittbrunnen" -- 8-9 adults round a table -- and eight people cannot sit on two
benches. It gives no dimension for either end, both are FITTED, and they are not
the same size or the same height, because they are not the same thing.

Aft is a bench: 470 mm deep, at seat level, with a locker lid in it.

Forward is the bridgedeck step to the companionway: 220 mm deep -- a tread, not
a seat -- and level, half way between the footwell sole and the companionway
sill. See `deck._bridgedeck_level`. It is also what the mainsheet horse stands
on.

It was moulded level with the sill to begin with, which made it one 265 mm riser
out of the well with nothing to walk up. Halved, it is two: sole to step, step to
sill. The doorway did not move -- it cannot, it comes off the cabin stairs -- so
what used to be flush is now a threshold to step over, which is what a bridgedeck
is."""

COCKPIT_LOCKER_START = 5.740
COCKPIT_LOCKER_END = 6.880
COCKPIT_LID_SEAM = 0.014
COCKPIT_LID_PROUD = 0.007
"""The bench lids, and the lockers under them: "Under bankarna i brunnen finns
tva rejalt tilltagna utrymmen dar du kan stuva storre saker som
utombordsmotor, tank, reservdunkar, tagvirke m m" (brochure p3), and
"Bankluckorna ar forsedda med lasbeslag" -- the lids lock. The 1975 revision
lists "Nya bankluckor" among its changes, so a 1980 boat has the later ones.

Two lockers, and the brochure means the two side benches. The aft bench gets a
lid as well here, which no source supports -- it comes with the aft bench, and
both are a deliberate departure.

Modelled the same way as the anchor box: a lid standing proud, casting its own
seam. A lid flush in an uncut surface is a lid nobody can see.

Seven millimetres here against the anchor box's four, and the difference is
about light rather than about the boat. The foredeck is a curved surface with
the sun raking across it, so four millimetres throws a line the length of the
lid. A cockpit bench is flat, shaded by its own coaming and lit from almost
straight above, and at four millimetres the seam simply was not there."""

ANCHORBOX_START = 0.320
ANCHORBOX_END = 0.980
"""The drained anchor locker let into the foredeck. The brochure gives it a
heading of its own -- "Ankarboxen", p3 -- and its position in the first line:
"Langst fram i foren hittar du en verklig dranerad ankarbox". *Langst fram*, at
the very front. It arrived with the 1975 deck ("Nytt dack med forlig
forvaringsbox"), so a 1980 boat has it, and its flush lid is why the foredeck
reads as clean: "det sticker inte upp nagra kanter eller beslag du kan snubbla
pa".

This used to run 950-1850 -- a 900 mm box sitting amidships on the foredeck,
which is neither where the brochure puts it nor what the bow-on photograph
shows. Moved forward to end 980 mm from the stem, forward of everything."""

ANCHORBOX_HALF_WIDTH_FWD = 0.075
ANCHORBOX_HALF_WIDTH_AFT = 0.330
"""Half-width at each end. The lid is a trapezoid narrowing to the stem, not a
rectangle: `refs/extracted/bowon_deck.png` shows its seams as straight lines
converging forward, and from any angle on deck it reads as a triangle.

The two margins to the deck edge are deliberately unequal -- 85 mm forward
against 169 mm aft. A moulded hatch aperture has straight sides and the deck
edge is a curve, so the gap between them cannot be constant, and forcing it to
be would bow the seams in exactly the way the photograph shows they do not."""

ANCHORBOX_LID_PROUD = 0.004
"""How far the lid stands above the deck around it.

Nearly nothing, and it is the whole reason the lid is visible. The locker used
to be modelled as a 20 mm well sunk into the deck, and a well sunk into an
unbroken surface is geometry that can never be seen: the deck is a single
lofted skin with no hole in it, so the recess sat underneath it rendering
nothing. What shows on the real boat is the seam, and the cheapest honest way
to get a seam without cutting the deck is to let the lid stand a few
millimetres proud and cast its own line.

Four millimetres does not contradict the brochure's boast that "det sticker
inte upp nagra kanter eller beslag du kan snubbla pa" -- nobody trips on 4 mm,
and this is the flushest fitting on the boat either way."""

FOREHATCH_APEX = DECK_STEP_APEX
FOREHATCH_END = 3.330
FOREHATCH_HALF_WIDTH = 0.230
"""The glazed foredeck hatch: "I taket finns en lucka upp till fordack. Den ar
forsedd med en ruta i rokfargad plexiglas sa du far in dagsljus" (brochure p4).
Smoked acrylic from 1976 on -- "Plexiglas i forluckan" -- and a fully
transparent hatch from 1978, so a 1980 boat has it glazed.

Not a rectangle, and not on the foredeck. It sits on the raised section abaft
the deck step and just forward of the mast, and it is *pointed*: its forward
apex is the apex of the deck step's chevron, and its two forward edges run out
along the chevron's own arms. The whole thing reads as one arrow -- the step
noses forward into the foredeck, and the hatch continues the same lines back
from the same point.

That is why FOREHATCH_APEX is DECK_STEP_APEX rather than a number: they are the
same point, and giving the hatch a value of its own would let the two drift
apart the moment the step moved. The angle of the forward edges is derived the
same way, from DECK_STEP_SWEEP -- see `deck.forehatch_outline`.

It ends 120 mm short of the mast at 3450. Checked against
`refs/extracted/hatch_zoom.png`, which shows the mast-step fittings immediately
abaft the hatch's after edge.

NOTE: this places the hatch over the wardrobe compartment and the forward end of
the saloon, not over the forepeak -- and the brochure describes it in the
forepeak. The bulkheads, not the hatch, are what is wrong: BULKHEAD_FWD is
FITTED and this is the first evidence found that bears on it."""

FOREHATCH_FRAME_PROUD = 0.022
FOREHATCH_FRAME_WIDTH = 0.040
"""The frame stands a little proud, and is the same width all the way round --
including round the point, which is what makes the aperture inside it a smaller
version of the same shape rather than a rectangle with its corners cut off.

FITTED. Everything else on this deck is flush by design, so the hatch is the one
thing you could trip over, and the bow-on photograph shows exactly that: a low
rim catching its own shadow."""

HAS_SKEG = True
"""There is a small fin running between the keel and the rudder -- brochure p2,
"en fena som gar mellan kolen och rodret", and visible in the profile drawing.
No specification table mentions it."""


# --- Keel, rudder and skeg ------------------------------------------------
#
# Scaled off the brochure profile drawing (refs p2), which shows the whole
# underwater body. Cross-checked against draft 1450 (C.5.1) and keel weight
# 800 kg (E.2.2): a fin these dimensions at this thickness comes out at roughly
# 800 kg of cast iron, which is a decent sign the proportions are read right.

KEEL_SECTIONS = [
    # (fraction of span from root to tip, leading-edge station, trailing-edge
    # station, thickness). The tip sits at DRAFT below the waterline.
    #
    # The bottom third is a genuine bulb, not a thickened fin. It is obvious on
    # a boat out of the water -- a rounded mass swelling well proud of the fin
    # and hanging aft of its trailing edge -- and it was missed here first time
    # because the brochure's profile drawing renders it as a flat ellipse that
    # reads as a plan-view annotation.
    #
    # The proportions are constrained rather than free: rule E.2.2 puts the
    # casting at 800 +/- 25 kg, and `verify.py` weighs the built mesh in cast
    # iron. A fin without a bulb comes out light.
    (0.00, 3.530, 5.130, 0.142),
    (0.45, 3.720, 5.010, 0.114),
    (0.78, 3.895, 4.880, 0.092),
    (0.88, 3.905, 4.985, 0.212),
    (0.95, 3.950, 4.955, 0.252),
    (1.00, 4.060, 4.780, 0.098),
]

CAST_IRON_DENSITY = 7200.0
"""kg/m3. Rule E.2.1 says the keel is iron; E.2.2 weighs it."""

RUDDER_CHORD_TOP = 0.480
RUDDER_CHORD_BOTTOM = 0.390
RUDDER_DEPTH = 1.050
"""Below the waterline. Shallower than the keel, as it should be."""

RUDDER_TOP = 0.320
"""Above the waterline, where the blade is hung on the transom."""

RUDDER_THICKNESS = 0.055

SKEG_START_STATION = 5.130
SKEG_END_STATION = 7.350
SKEG_DEPTH = 0.070
"""How far the skeg stands proud of the canoe body. Shallow -- it is barely
visible in the profile drawing, which is consistent with the brochure treating
it as something you only notice on the hard."""

SKEG_THICKNESS = 0.048


# --- Deck fittings and cockpit hardware -----------------------------------
#
# None of this is in the class rules and almost none of it is in the brochure.
# The rules measure a hull and a rig; the brochure sells an interior. What is
# bolted to the deck between them is described here from photographs of the
# class and from what the boat cannot work without -- a masthead rig has to have
# somewhere to sheet the main, a transom-hung rudder has to have something to
# steer it by, and a boat you walk to the foredeck of has to have something to
# hold on to.
#
# So every number below is FITTED. What they are fitted to is stated where it
# is not obvious, and where a dimension came from a person rather than from the
# boat -- a stanchion is 1.5 ft tall because that is where a lifeline catches a
# falling adult, not because of anything about a Maxi -- it says so.
#
# They matter more than their size suggests. The camera path stops in the
# cockpit and looks forward, so the traveller, the winches, the tiller and the
# stern rail are the only objects on the whole boat the visitor is ever within
# arm's reach of. Everything else is scenery.

COCKPIT_GRATING_PLANK = 0.080
COCKPIT_GRATING_GAP = 0.040
COCKPIT_GRATING_THICKNESS = 0.018
COCKPIT_GRATING_MARGIN = 0.030
"""Teak flooring laid fore-and-aft in the footwell: 80 mm planks with 40 mm
between them.

The gaps are what make it flooring rather than a floor. A cockpit sole drains,
and a solid teak sole laid on a moulded one would hold the water it is supposed
to let past -- so this is really a grating, wide-slatted, sitting on the
moulding and keeping feet out of whatever is on it.

The pattern is laid out from the centreline *outwards from a gap*, not from a
plank: an even number of planks with a seam down the middle, which is what a
boatbuilder does with a symmetrical sole and is the only version of this that
does not need a half-width plank somewhere. How many there are is not a
parameter -- see `fittings.cockpit_grating`, which fits as many as the footwell
holds and lets the margin take the remainder."""

TRAVELLER_STATION = 5.320
TRAVELLER_HALF_WIDTH = 0.420
TRAVELLER_RADIUS = 0.011
TRAVELLER_STAND = 0.045
TRAVELLER_FOOT = 0.032
"""The mainsheet horse: a bar athwart the bridgedeck step, close to its after
edge, with the sheet blocks running on it.

A bar rather than a modern extruded track, because that is what a 1980 boat of
this size has and because a round bar is a shape you can read from three metres
away. Its position is not free: the mainsheet has to land under the boom, the
boom is 2500 mm long from a mast at 3450, and the step at the forward end of
the well is the only structure anywhere near the middle of that span.

Close to the after edge of the step -- 60 mm off it -- so the blocks hang over
the footwell and not over the step, which is where the helmsman's feet are.

It sits 45 mm off the moulding, not the 75 it started at. A horse wants only the
clearance a shackle needs to swing under it; more than that and the bar stops
reading as part of the step and starts reading as a handrail bolted to it."""

STERN_RAIL_RADIUS = 0.016
STERN_RAIL_STAND = 0.300
STERN_RAIL_RETURN = 0.305
STERN_RAIL_CORNER = 0.150
STERN_RAIL_LEG_HALF_BEAM = 0.430
STERN_RAIL_BEND = 0.065
"""The chrome rail round the back of the cockpit: right across the after end,
round both corners, and a foot forward along each side, standing 300 mm above
the deck.

Four legs hold it up. Two are straight, on the after edge either side of the
centreline, and they are set in far enough to leave the tiller its own gap
between them. The other two are the forward ends of the rail itself, bent down
through a quarter turn of 65 mm and carried on to the deck -- which is how a
pushpit this size is made, and why it is one tube a side rather than a rail and
a stanchion meeting at a fitting.

It began as a capping rail lying 24 mm off the coaming, on the argument that a
full pushpit would fight the line the brochure sells hardest, "sitt hoga slata
dack". At 24 mm it read as trim rather than as something to hold, and the tiller
had to be routed *over* it with 20 mm to spare, which put the helm's arm at deck
height across the whole cockpit. At 300 the tiller goes under it with 180 mm
clear and the rail is at the height a hand actually looks for."""

COCKPIT_WINCH_STATIONS = (5.600, 6.210)
COCKPIT_WINCH_BASE = 0.040
COCKPIT_WINCH_WAIST = 0.032
COCKPIT_WINCH_HEIGHT = 0.105
"""Two small sheet winches a side, 610 mm -- two feet -- apart on the side deck
outboard of the coaming.

The stations are constrained rather than chosen. A winch has to stand on side
deck, and the side deck alongside this cockpit is barely 100 mm wide: it is
157 mm at 5600 and has narrowed to 89 mm by 6210, so a 40 mm winch base at the
after station only just fits and anything further aft does not fit at all. The
pair is placed as far forward as the coaming allows and the spacing follows.

`fittings` centres them across whatever side deck it finds at each station
rather than at an offset given here, so they stay on the deck if the beam
curve or the cockpit width moves."""

TILLER_TIP_STATION = 6.560
TILLER_HEAD_ABOVE_SHEER = 0.270
TILLER_TIP_ABOVE_SHEER = 0.060
TILLER_ROOT_SECTION = (0.062, 0.042)
TILLER_TIP_SECTION = (0.036, 0.028)
"""The steering arm: one piece of wood from the head of the transom-hung rudder,
up over the after deck and forward into the cockpit.

Its head height is set by what it has to clear rather than by comfort. The rudder
is hung on the transom, so the arm has to rise above the after deck before it can
turn forward, and the deck is crowned 47 mm at the centreline. 270 above the
sheer carries the arm over it with 60 mm to spare.

It used to have to clear the stern rail as well, when that rail lay on the
coaming: the two passed within 20 mm of each other and this number was set by the
rail rather than by the boat. Raised to 300 mm the rail is a pushpit, the tiller
goes under it, and the only thing left in the way is the deck.

The tip is then as low as the sweep will let it be, because the height the arm
needs at the transom is nowhere near the height a hand wants over the well. It
falls 210 mm over its length to end 310 mm above the side bench, which is where
someone sitting on that bench can hold it.

The tip lands at station 6560, a little forward of the after bench, so the whole
sweep of it is over the footwell where there is nothing to foul."""

OUTBOARD_OFFSET = 0.400
OUTBOARD_BRACKET_TOP = 0.340
OUTBOARD_SHAFT_FOOT = -0.230
OUTBOARD_COWLING = (0.230, 0.195, 0.240)  # fore-and-aft, athwartships, tall
OUTBOARD_PROP_DIAMETER = 0.190
"""A small outboard on a transom bracket, offset to starboard.

Offset because it has to be: the rudder is hung on the centreline, and a motor
on the centreline is a motor bolted to the rudder. 400 mm to starboard clears
the blade and still lands on transom rather than on the tuck of the topsides.

The brochure stows the motor rather than mounting it -- the cockpit lockers are
sold on holding "utombordsmotor, tank, reservdunkar" -- so this is a departure,
and a deliberate one. The boat in the scene is at anchor, and a small cruiser at
anchor with nothing on the transom reads as a model rather than as a boat
somebody arrived in.

How low it hangs is not a matter of taste. The whole propeller disc has to be
under water or the motor ventilates the moment it is asked for anything, and the
disc is 190 mm across -- so the foot has to be 230 mm down, which in turn puts
the bracket 340 mm above the water and the cowling below the rubrail. The first
version was mounted where it looked tidy, 200 mm higher, and half the propeller
was in the air."""

PULPIT_FOOT_STATION = 0.900
PULPIT_NOSE_STATION = 0.180
PULPIT_STRUT_STATION = 0.420
PULPIT_RADIUS = 0.014
PULPIT_LEG_RAKE = 0.130
PULPIT_LEG_SPLAY = 0.045
PULPIT_BLOCK = (0.110, 0.070, 0.045)
"""The bow pulpit: a hoop round the stemhead, its feet 900 mm aft of the stem.

The feet are as far aft as the fore hatch and the anchor box allow and as far
forward as the deck is wide enough to stand them on -- the boat is only 1000 mm
across at station 900, and the plan curve of the rail from there to the stem is
taken off the deck edge itself rather than drawn, so the pulpit narrows the way
the foredeck does.

The nose stops 180 mm from the stem, which is just forward of where the forestay
lands at station 115, so the hoop closes round the stemhead fitting instead of
behind it. It cannot go further: the deck at station 130 is 90 mm across, and a
hoop taken all the way to the stem closes to a hairpin narrower than the tube it
is made of.

The legs are neither plumb nor parallel. They rake 130 mm forward over their own
height and splay 45 mm outboard, so the rail leaves them ahead of and outside
their own feet. Both are what the fitting is for: raked, the hoop is thrown out
over the stemhead where the anchor and the headsail come aboard instead of
standing back from it; splayed, the top of the rail sits outboard of the deck
edge, which is where you want it when it is the only thing between you and the
water. The splay fairs back out over the 300 mm abaft the feet, so the hoop
leaves them wide and is on the guardrail line before it begins to converge.

`PULPIT_BLOCK` is the teak pad at the apex -- fore-and-aft, athwartships, thick.
Every pulpit on a boat that anchors has one, because the chain comes in over the
bow rail and stainless on stainless is a noise you can hear below."""

STANCHION_AHEAD_OF_COMPANIONWAY = 0.100
STANCHION_HEIGHT = 0.457
STANCHION_RADIUS = 0.011
STANCHION_INSET = 0.055
LIFELINE_LOWER_FRACTION = 0.48
"""Two stanchions a side carrying two wires, pulpit to the after post.

Neither station is given here, because neither is free. The after post stands
100 mm ahead of the head of the companionway -- close enough to read as in line
with it from the cockpit, far enough that the two do not foul -- and the forward
post halves what is left to the pulpit. Both therefore come out of
`fittings.stanchion_stations`, off the doorway the deck already has.

That is a change from a fixed pair at 1700 and 3250, which put both posts on the
foredeck and left the side deck alongside the coachroof -- the part anybody
actually walks -- with nothing to hold on to. Hung off the companionway instead,
the guardrail runs from the bow to the cockpit, which is what a guardrail is for.

1.5 ft is a stanchion height rather than a Maxi 77 dimension: it is set by where
a wire catches a falling adult, and it is the same on every boat this size. The
lower wire sits just under half way up, close enough to the deck that nothing
goes under it."""


# --- Rig ------------------------------------------------------------------

MAST_STATION = 3.450
"""Stem point to the front face of the mast. Rule F.2.2: 3450 +/- 20 mm."""

FORETRIANGLE_BASE = 3.335
"""J. Rule F.2.2: 3335 +/- 10 mm. Agrees with the published IOR J of 10.9 ft."""

LOWER_BAND_ABOVE_SHEER = 1.208
"""Boom-height datum: the lower measurement band sits this far above the sheer
line (top of the rubrail).

DEPARTURE. Rule F.2.2 puts this at 1360 +/- 25 mm, and the brochure sells the
consequence: "Genom att bommen sitter en bit upp pa masten far du en ordentligt
fri hojd i sittbrunnen" -- the boom is up the mast, so the cockpit is clear.
Dropped half a foot on purpose. With a mainsail bent on, a boom at the rule
height leaves a band of daylight between foot and coachroof that reads as a
dinghy rig rather than a cruiser's.

This is one of two places in the file where how it looks has been allowed to beat
what it measures. Both are marked, rather than quietly adjusted."""

MAINSAIL_HOIST = 7.500
"""P, lower band to upper band. Rule C.6.1 gives max 7500 mm; matches IOR
P of 24.6 ft."""

BOOM_LENGTH = 2.805
"""E, mast aft face to the boom band.

DEPARTURE, the second one, and the same argument. Rule C.6.1 caps E at 2500 mm
and the published IOR figure agrees; this is a foot longer. At 2500 against a
7500 hoist the mainsail is a tall narrow triangle, and the masthead rig on the
brochure's drawing is not.

`verify.py` still measures the built boom, and still measures it against this
number rather than against the rule -- so the geometry cannot drift from the
parameter, and the parameter says plainly that it is outside the class."""

SPREADER_LENGTH = 0.860
"""Rule F.2.2: not less than 860 mm."""

SPINNAKER_POLE = 3.350
"""Rule F.4.1: max 3350 mm from the mast front face."""

MAST_IS_DECK_STEPPED = True
"""Rule F.7.1 -- the mast stands on the coachroof, not on the keel."""

MAST_SECTION = (0.090, 0.130)
"""Athwartships x fore-and-aft dimensions of the extrusion. FITTED, from photos
of the standard rig; the rules only say it must match the standard rig."""

STAY_DIAMETER = 0.005
"""Rule F.5.2: minimum 5 mm. Standing rigging is drawn at the minimum."""

MASTHEAD_ABOVE_SHEER = 9.174
"""I, the foretriangle height: 30.1 ft, from the published IOR measurements.

The class rules pin the mast's *bands* but never its overall height, so this is
what sets where the top of the rig is. It cross-checks: the lower band sits 1360
above the sheer and P is 7500, putting the upper band at 8860 -- leaving 314 mm
of masthead above it for the crane and sheaves, which is about right."""

MAST_TAPER = 0.82
"""Section at the masthead relative to the base."""

BOOM_SECTION = (0.076, 0.104)
"""Athwartships x vertical. FITTED from the rig drawing."""

BOOM_RISE = 0.090
"""How much the boom lifts over its length. Slight."""

SPREADER_HEIGHT_FRACTION = 0.52
"""Spreaders up the mast, as a fraction of its length. Single-spreader masthead
rig, so they sit a little above half height."""

CHAINPLATE_STATION = 3.600
CHAINPLATE_HALF_BEAM = 0.950
"""Where the shrouds land on deck. Not dimensioned anywhere, but heavily
constrained: the spreaders are at least 860 mm (F.2.2), which puts their tips
905 mm off centreline, and a masthead rig wants the upper shroud running very
nearly straight from masthead to chainplate through that tip. 950 mm is what
satisfies that."""

BABYSTAY_STATION = 2.900
BABYSTAY_HEIGHT_FRACTION = 0.42
"""The babystag, named on the rig drawing, bracing the mast forward."""

BACKSTAY_BRIDLE_HEIGHT = 1.150
BACKSTAY_BRIDLE_HALF_BEAM = 0.450
"""The backstay splits into two legs before it reaches the deck, landing on the
transom quarters either side of the centreline.

Not decoration, and not a preference. A masthead backstay comes down a nearly
vertical line to the transom and a tiller runs forward from the rudder head at
very nearly a level one, so the two cross -- always, at some station, whatever
height either is given. There is no version of a single centreline backstay and
a tiller that reaches the cockpit that does not put a wire through the helmsman's
arm. A bridle is what boats of this kind do about it, and the geometry is why."""

SAIL_COVER = False
"""A cover flaked over the boom, for when the sails are not bent on.

Mutually exclusive with SAILS_HOISTED: a boat cannot have both, and having
neither is the bare boom this was written to avoid."""

SAILS_HOISTED = True
"""Whether the sails are up.

The boat lies at anchor in the scene and a boat at anchor normally has its sails
off, which is why this began as a cover over a bare boom. But the sails are most
of what a sailing boat *is*: from the ocean stop they are the whole silhouette,
and without them the model is a hull with a pole in it. Hoisted and drawing, with
the main sheeted flat -- somebody about to weigh anchor rather than somebody who
has settled in for the night."""


# --- Sails ----------------------------------------------------------------
#
# Set drawing rather than hanging. The boat is at anchor, so strictly the sails
# should be slatting with no shape in them at all -- and a slatting sail is a
# cloth simulation, which is a great deal of work to make something look limp.
# They are built full, sheeted flat, on a light breeze from starboard.
#
# The shape is described by three numbers -- draft, where the draft is, and how
# much the leech twists off -- rather than by a mesh, because those three are
# exactly what a wind would change. See `sails.py`: the surface is a plain grid
# generated from them, so making it react to wind later means driving these from
# a direction and a strength, not rebuilding the geometry.

MAINSAIL_LEECH = 7.800
"""Rule G.4.3: 7722-7880 mm. Mid-range."""

GENOA1_LUFF = 9.120
"""Rule G.5.3: 9026-9210 mm. Mid-range. Also sets the forestay length."""

GENOA1_LEECH = 8.620
"""Rule G.5.3: 8536-8710 mm."""

GENOA1_FOOT = 5.315
"""Rule G.5.3: 5263-5370 mm."""

SAIL_DRAFT = 0.115
SAIL_DRAFT_POSITION = 0.38
SAIL_TWIST = 0.150
"""The shape in the cloth: maximum camber as a fraction of the chord, where
along the chord it sits, and how far the leech falls away by the head -- again
as a fraction of the chord.

Draft forward of the middle and twist at the top are what make a sail read as a
sail rather than as a triangle. A flat panel with the right outline is
unmistakably wrong from any angle and it is not obvious why until you put the
camber back.

All three are to leeward, which here is to port: the main is sheeted flat on the
centreline and the breeze is on the starboard side. Nothing in the geometry knows
that except the sign of these, which is the point -- swinging the wind round
later is a change to three numbers and a boom angle, not to a mesh."""

MAINSAIL_ROACH = 0.155
MAINSAIL_FOOT_ROUND = 0.055
"""How far the mainsail's leech bulges aft of the straight line from head to
clew, and its foot above the straight line from tack to clew.

Roach is what the battens are for and it is most of the difference between a
mainsail and a triangle: the leech of a real one is convex over its whole
length. It is kept modest because the backstay is standing rigging on this boat
rather than something you ease, and a roach that fouls it is a roach nobody
would cut."""

GENOA_CLEW_STATION = 5.230
GENOA_CLEW_ABOVE_TACK = 0.560
GENOA_CLEW_OFFSET = -0.780
"""Where the headsail's clew sits: aft, up a little, and out to port.

Aft of the mast, which makes this an overlapping genoa rather than a jib -- the
class sail is 5315 mm on the foot against a 3335 mm foretriangle base, which is
about 160%, and it has to go somewhere. Out to port because that is the leeward
side; the sheet leads to the port side deck and the clew is over the water
outboard of the shrouds, which is what a genoa this size does."""

SAIL_NUMBER = "SWE 2875"
SAIL_NUMBER_HEIGHT = 0.300
"""The registration, on the mainsail.

This used to be argued onto the headsail, on the grounds that a 160% genoa is
the biggest sail flying and the number needs the room. That argument is about
where there happens to be space, not about where a sail number belongs: a
genoa is whichever headsail is bent on for the day's wind and the first thing
that comes off when it breezes up, and a masthead rig's identity is carried by
the sail that never comes off the boat, which is the mainsail. Every one-design
fleet of this kind carries its numbers there for exactly that reason.

300 mm rather than the ISAF minimum of 230 for a boat this length: the mainsail
does not have to share its forward third with a mast the way the genoa did, so
there is no reason left to cut the number to the smallest legal size, and 300
is what a boat of 7.6 m actually carries.

Both sides carry it, each reading the right way round from its own side, because
the camera path passes the boat on one side and stops on the other."""


# --- Interior -------------------------------------------------------------
#
# Nothing below is in the class rules: they measure a hull and a rig, and stop
# at the deck. So every dimension here is FITTED, and what it is fitted to is
# the factory brochure's page 4, "Inredningen", which describes the whole
# accommodation in prose without giving a single number, plus the year-by-year
# build changes recorded by the owners' community.
#
# What that prose does give is *constraints*, and they are surprisingly tight:
#
#   "sammanlagt fem personer, tva i forpiken och tre i salongen"   5 berths, so
#       both settees are berths and one of them is a double, or the quarter
#       berth is the third. The forepeak is two.
#   "Forpik med fullangdskojer"                                    full length,
#       which for two adults is not less than 1.9 m.
#   "det basta av allt ar att du har stahojd nar du lagar mat"     standing
#       headroom at the galley. Sold as the best thing about the boat, which
#       only makes sense if there is *not* standing headroom elsewhere -- and
#       there is not: see SOLE_LEVEL.
#   "Trappan pa bilden bestar av tva stora dragbara lador"         the
#       companionway steps are two drawers.
#
# The 1975 revision (hull 700+, so a 1980 boat has all of it) is what the
# layout actually is: "Basinredning i form av ett innerskrov i plast ... ny
# basinredning med lagre durknivan ... Ruffskottet flyttas akterut med mindre
# lutning ... Dubbla huvudskott mellan salong och forpik". A moulded plastic
# inner hull rather than built-up plywood joinery, a lowered sole, and *two*
# main bulkheads rather than one. 1979 adds "Nytt pentryutforande".

SOLE_LEVEL = -0.190
"""Top of the cabin sole, above the waterline datum.

The anchor value: every other height here is hung off it, and it is what
decides whether the boat has the headroom the brochure claims. The canoe body
bottoms out at -0.450 amidships, so this leaves 260 mm of bilge for the keel
floors and bolts, and puts the sole 1545 mm under the raised panel over the
companionway -- which is the galley, and is standing headroom for most people.
Forward of that panel, under the plain coachroof, it falls to about 1490 mm,
which is not. That is exactly the distinction the brochure draws.

Lowered by the 1975 revision ("lagre durkniva"), and a 1980 boat has it."""

SOLE_HALF_WIDTH = 0.270
"""Half-width of the walkway between the settee fronts. 540 mm clear.

Constrained from below by the hull rather than chosen: at SOLE_LEVEL the hull
is only 980 mm wide amidships, so a wider sole leaves the settees no depth to
sit on and a narrower one wastes the beam the boat does have."""

LINER_THICKNESS = 0.018
"""How far the moulded inner hull stands inboard of the hull skin where the two
meet. The liner is a separate GRP moulding bonded inside the hull -- "ett
innerskrov i plast", 1975 -- not a lining stuck to it."""

DECKHEAD_THICKNESS = 0.022
"""Deck moulding thickness. The cabin ceiling is the deck's own underside, so
the deckhead is `deck.height_function()` less this -- which keeps the two in
step the way the rig already is, rather than guessing at the deck twice."""

# Bulkheads and the space between them.

BULKHEAD_FWD = 2.720
BULKHEAD_AFT = 3.100
"""The "dubbla huvudskott mellan salong och forpik" of the 1975 revision: two
main bulkheads, not one, with a compartment between them.

Placed to straddle the step in the deck, whose apex is at 2770 (DECK_STEP_APEX)
and whose arms sweep aft to 3250 at the sheer. That is where a moulded deck
wants bulkheads under it -- the step is the stiffest line on the whole
moulding -- and it is the one placement that is not arbitrary."""

LOCKER_DOORWAY_HALF_WIDTH = 0.230
"""The gap on the centreline between the wardrobe and the clothes locker: the
way through to the forepeak. 460 mm, which is narrow, and is why the brochure
sells the two lockers either side of it rather than the passage."""

WARDROBE_SIDE = -1
"""Which side the hanging wardrobe is on: -1 port, +1 starboard.

Port. It is the one thing the 1972 boat did not have -- "Garderobsskott om
babord saknas" in the first year's change list -- which names the side it was
added on. The clothes locker faces it: "stuvar trojor och skjortor i
kladskapet mitt emot"."""

# Berths.

FOREPEAK_BERTH_START = 0.620
FOREPEAK_BERTH_END = BULKHEAD_FWD
"""The V-berth: 2100 mm, which is the "fullangdskojer" of the brochure heading
with room to spare. Forward of 620 the hull is too narrow to lie in."""

FOREPEAK_BERTH_LEVEL = 0.110
"""Top of the forepeak berth flat. High enough that the toilet stows under it
-- "Under dynan finns plats avpassad for toalett" -- and low enough to sit up
on under a foredeck that is only about 970 mm above the water there."""

SETTEE_START = BULKHEAD_AFT
SETTEE_END = 5.000
"""Saloon settee berths: 1900 mm, both sides. Three of the boat's five berths
are in here, so one side is wide enough to sleep two or the quarter berth is
the third -- the brochure does not say which, and does not have to."""

SETTEE_LEVEL = 0.210
"""Seat top: 400 mm above the sole, which is a seat.

Drawn 100 mm lower to begin with, and it looked wrong the moment anything was
put next to it -- a 290 mm seat is a step, and it left the saloon table
standing 770 mm above the sole with nobody able to reach it. Seat height is one
of the few dimensions on a boat that is set by people rather than by the boat.

How deep the seat is has no number, because it is not free: the
settee runs from the edge of the sole out to the hull, and the hull is 980 mm
wide at this height amidships. Once SOLE_HALF_WIDTH has taken its share, about
540 mm of seat is left, which is deep enough to sleep two across -- which is
what the brochure's "tre i salongen" needs it to be."""

TABLE_TOP = SOLE_LEVEL + 0.680
"""Height of the saloon table, off the sole rather than off the seat: a table is
a table height whatever is drawn beside it.

The owner's brief asked for the galley worktop to come up to the table -- so
GALLEY_TOP below is defined from this number rather than carrying a second guess
at "counter height", which is what put the two 190 mm apart in the first place."""

SHELF_LEVEL = 0.560
SHELF_DEPTH = 0.130
SHELF_THICKNESS = 0.014
"""The shelf above the backrests: "Eller titta ovanfor ryggstoden till kojerna.
Dar loper en hylla som ar idealisk for smasaker" -- above the backrests to the
berths runs a shelf, ideal for small things.

It runs the length of the saloon and stops at the bulkheads, which is what makes
it read as part of the boat rather than as a plank: a shelf that ran on past the
cupboards would be a shelf nobody could have fitted."""

FIDDLE_HEIGHT = 0.038
FIDDLE_THICKNESS = 0.016
FIDDLE_SCALLOP = 0.004
"""The raised lip along the shelf's inner edge -- the one facing the cabin,
where a book actually can slide off, not the one against the hull where it
cannot. Teak, the same as the shelf itself, and low enough that it reads as a
lip rather than a second shelf on top of the first.

FIDDLE_SCALLOP is the wave in its top edge -- most real ones are worked with a
row of shallow scallops or finger slots rather than left as a straight batten.
Modelled as a sine in the swept profile's own height rather than as cutouts, so
it costs nothing beyond the stations the shelf is already lofted at."""

BACKREST_HEIGHT = 0.200
BACKREST_THICKNESS = 0.055
"""The cushioned bumper under the shelf, against the topsides: 200 mm deep and a
couple of inches thick, curved because the hull is.

It is a backrest and it is also the only thing between a shoulder and 6 mm of
GRP. Hung off the underside of the shelf rather than given a height of its own,
so the two cannot part company."""

CUSHION_THICKNESS = 0.075
"""Settee and berth cushions. Thick enough to sleep on, which is what three of
the five berths are.

They are the warmest thing below deck and they are what stops the cabin reading
as a moulding: the liner is one continuous surface from sole to sheer, and
without cushions on it the settees are a shelf that happens to be seat-height."""

FOREPEAK_BUMPER_ABOVE = 0.200
FOREPEAK_BUMPER_HEIGHT = 0.160
"""A second bumper in the forepeak, 200 mm above the mattress, wrapping the hull
round the head of the V-berth.

Same job as the saloon backrests and a different reason: nobody sits up against
it, but two people sleeping head-forward in a bow have their shoulders against
the topsides all night."""

LOCKER_DOOR_WIDTH = 0.420
LOCKER_DOOR_THICKNESS = 0.016
"""Doors on the wardrobe and the clothes locker, in the after bulkhead either
side of the way through to the forepeak.

The compartment between the two bulkheads *is* those lockers -- see the module
docstring in joinery.py -- so the doors are the only part of them that has to be
built. Plain teak-faced ply, which is what they are."""

SINK = (0.280, 0.240, 0.026)
SINK_STATION = 4.850
COOKER = (0.320, 0.250)
COOKER_STATION = 5.160
"""The pentry's two fittings, immediately to port as you come below: sink
forward, two-burner cooker aft. That order is the brochure's -- "Till hoger pa
banken har du det tva-lagiga koket", and *right*, from someone standing at the
worktop facing outboard, is aft.

Both moved forward with the worktop when its after end came in (see GALLEY_END):
the cooker now lands at 5.160 with its after edge clear of where the cockpit seat
falls to worktop level, and the sink ahead of it, the two nearly touching
because the shortened run has no spare length between them.

The sink is a proper bowl now, and the cooker a gimballed two-burner with pan
rails and control knobs, rather than the shallow dish and bare pan they were --
the galley is the closest the camera comes to any joinery, and a tap standing
over a dished box was as much as the first pass claimed. Both are still built
proud of the worktop rather than let into it: the worktop is a lofted solid with
no hole in it, so a recess cut into it renders nothing at all. A bowl standing a
few millimetres proud with a hollow top reads as inset from any angle a person
in the cabin actually has on it."""

QUARTER_BERTH_START = 5.000
QUARTER_BERTH_END = 6.950
"""The stickkoj, starboard, running aft under the cockpit seat.

1950 mm, of which all but the first 160 sits under the bridgedeck and the
cockpit. That is the whole idea of a quarter berth and the reason it costs the
saloon no length -- and it is also why it has to be this long: it was first
drawn at 1400, which is not a berth, and there is nothing aft of it competing
for the space it needs."""

# Galley, port, at the after end of the saloon.

GALLEY_START = 4.700
GALLEY_END = 5.340
GALLEY_TOP = TABLE_TOP
GALLEY_DEPTH = 0.480
"""The pentry. Port side, at the companionway, where the raised panel over the
way below gives the headroom the brochure sells: "Pentryt ar stort och
ordentligt tilltaget ... gjort for att du utan problem ska klara matlagningen
for 5-6 personer".

It runs aft past the coachroof and under the side deck, which is what makes a
worktop this long fit in a boat whose saloon is only 1900 mm long. Sink forward,
two-burner hob aft -- "Till hoger pa banken har du det tva-lagiga koket", and
right, from someone standing at it facing outboard, is aft.

The after end was 5.480 and had to come forward to 5.340. Raising GALLEY_TOP to
the table's height (below) lifted the worktop to 490 mm above the sole, and the
cockpit seat above it drops going aft -- the two crossed at about station 5.36,
so the last 140 mm of worktop, and the hob standing on it, pushed up through the
cockpit seat moulding and showed in the footwell. The worktop now stops where it
still has the seat comfortably above it. The forward end went with it, 60 mm
forward to 4.700, to keep room for both fittings once the run was shortened.

GALLEY_TOP used to be 300 mm above the sole, a plain fitted guess and 190 mm
short of the table -- so a visitor stepping from one to the other met a worktop
at knee height next to a table at hip height, on the same boat. Owner's brief:
raise it to match. Tied to TABLE_TOP rather than given its own number, so the
two cannot drift apart again -- and raising it is what forced the shortening
above, which is the price of the matched height, paid once and recorded here."""

# The way below.

STEP_TREADS = 3
STEP_RISE = 0.190
STEP_HALF_WIDTH = 0.230
STEP_DEPTH = 0.230
"""The companionway steps: "Trappan pa bilden bestar av tva stora dragbara
lador ... plus ett stuvfack i det oversta trappsteget" -- two big pull-out
drawers *and* a stowage compartment in the top step. Three treads, therefore,
not two: the count is in the sentence, just not in its first half.

Three risers of 190 carry the sole at -190 up to +380, and a fourth reaches the
companionway sill. That is what sets COMPANIONWAY_SILL, which is the one number
the inside and the outside of this boat have to agree about."""

COMPANIONWAY_SILL = SOLE_LEVEL + STEP_RISE * (STEP_TREADS + 1)
"""Bottom of the way below, at 570 mm: one riser above the top step.

Derived rather than fitted, because it is the single point where the
accommodation and the cockpit meet. Given a number of its own it would drift
away from the stairs the moment either moved, and the failure is silent -- a
sill 40 mm out looks perfectly normal and is a trip hazard on a real boat."""

TREAD_THICKNESS = 0.024
TREAD_NOSING = 0.022
GRABRAIL_HEIGHT = 0.340
GRABRAIL_RADIUS = 0.014
"""The steps were three plain boxes stacked into a staircase, which is what the
carcase underneath them still is -- but a real tread is teak, laid *on* that
carcase rather than being it, so it can nose out past the riser below.
TREAD_NOSING is that overhang: enough to throw a shadow line under the front
edge of every tread, which is what stops the stack reading as one solid block
with two grooves in it.

GRABRAIL_HEIGHT is a handhold's worth of tube standing off the top step, at the
side a hand actually falls to coming down backwards -- which is the only sane
way down a companionway this steep, so the rail exists to be found without
looking."""

MAST_POST_STATION = MAST_STATION
MAST_POST_DIAMETER = 0.055
HAS_MAST_POST = True
"""A compression post under the mast step: a round alloy tube, not a timber.

It is the pole that runs through the saloon table, which is the other half of its
job -- the table is hung on it, and the reason the table is where it is. Round
and bright rather than square and teak: the section is a drawn tube, and at 55 mm
on the centreline of a 1.9 m saloon it is the one thing below deck that is always
between the camera and everything else.

The mast is stepped on the coachroof (rule F.7.1), so its load has to reach the
keel through the accommodation somehow, and a post at the mast station is the
usual answer. But UNVERIFIED: no reference here shows one. The brochure's
interior photographs look forward and aft rather than up, and none of them
settles it. Built, flagged, and to be checked against a photograph of a real
saloon before it is treated as known -- the same standing as the cockpit
coaming, which is left out for the opposite reason."""


# --- Hull shape curves ----------------------------------------------------
#
# Each is a list of (station, value) control points, interpolated with a
# shape-preserving cubic in lib/curves.py. All FITTED against reference photos
# except where they are pinned to a rule above.

SHEER = [
    # Freeboard along the length. Pinned at both ends by C.2.2 and C.2.3.
    #
    # Very nearly a straight line: measured off the brochure profile drawing,
    # the sheer sags only about 15 mm below the straight bow-to-stern chord.
    # That flat sheer is a large part of why the boat looks the way it does --
    # the brochure leads on "sitt hoga slata dack", its high flat deck -- and an
    # earlier version of this curve with 100 mm of spring read as a different
    # and much more conventional boat.
    (0.000, FREEBOARD_BOW),
    (1.500, 0.913),
    (3.000, 0.858),
    (4.500, 0.812),
    (6.000, 0.772),
    (LOA, FREEBOARD_STERN),
]

PROFILE = [
    # The centreline profile, traced off the brochure drawing (refs p2) rather
    # than invented. Three things in it are characteristic and were all wrong
    # before that drawing turned up:
    #
    #   1. The stem is *straight*, raked about 36 degrees, not curved.
    #   2. There is a sharp knuckle at the forefoot, just below the waterline --
    #      "skarpa vinklar strax under vattenlinjen". Not a fair radius.
    #   3. The transom is immersed by about 330 mm. The run aft stays deep
    #      instead of sweeping up out of the water.
    #
    # The keel hangs below all this.
    (0.000, FREEBOARD_BOW),  # stem head, at the sheer
    (0.250, 0.640),  # straight stem
    (0.500, 0.300),  # still straight
    (0.721, 0.000),  # waterline, forward end -- sets LWL with the transom
    (0.800, -0.105),  # forefoot knuckle
    (1.200, -0.230),
    (1.800, -0.330),
    (2.600, -0.400),
    (3.400, -0.435),
    (4.300, -0.450),  # deepest point of the canoe body
    (5.200, -0.442),
    (6.200, -0.412),
    (7.000, -0.370),
    (LOA, -0.330),  # transom bottom, below the water
]

HALF_BEAM = [
    # Half-beam at the sheer, to the outside of the rubrail -- which is how the
    # class rules measure. Pinned at BEAM_STATION by D.3.2, and that station is
    # also the maximum.
    #
    # Proportions scaled off the brochure's overhead photograph (refs p3). That
    # shot is from the masthead so it has real perspective error and the
    # absolute numbers off it are not trustworthy, but the two things it shows
    # clearly are: max beam is well aft, at about 64% of the length, and the
    # stern stays broad, with the transom about 74% of maximum beam.
    (0.000, 0.000),
    (0.400, 0.245),
    (0.800, 0.455),
    (1.400, 0.700),
    (2.200, 0.930),
    (3.000, 1.080),
    (4.000, 1.210),
    (BEAM_STATION, BEAM_AT_STATION / 2),  # maximum
    (5.600, 1.240),
    (6.500, 1.130),
    (LOA, 0.930),  # transom half-width
]

SECTION_FULLNESS = [
    # Topsides and turn of the bilge. 2.0 is a quarter-ellipse; higher hardens
    # the bilge and squares the section off. Fine forward, full aft, which is
    # what the era's designs do. FITTED.
    (0.000, 1.85),
    (1.500, 1.88),
    (3.000, 2.00),
    (4.500, 2.30),
    (6.000, 2.60),
    (LOA, 3.00),
]

SECTION_TUCK = [
    # Deadrise at the centreline: 1.0 is a straight V, above 1 flattens the
    # floors, below 1 hollows the garboards. This curve is what sets the
    # displacement -- the hull came out 83% overweight on the first build with
    # flat floors everywhere. Deep V forward for a fine entry, flattening aft
    # under the cockpit. FITTED against the displacement check.
    (0.000, 0.91),
    (1.500, 0.91),
    (3.000, 0.93),
    (4.500, 1.00),
    (6.000, 1.15),
    (LOA, 1.42),
]


# --- Mesh density ---------------------------------------------------------

HULL_STATIONS = 96
"""Lengthwise divisions. Generous: the surface is decimated on export, and it
is cheaper to fair a dense mesh than to fight a coarse one."""

HULL_SECTION_POINTS = 28
"""Points per half-section, keel to sheer."""


# --- Derived helpers ------------------------------------------------------

def station_to_y(station: float) -> float:
    """Distance aft of the stem -> Blender Y. The hull is centred on the origin."""
    return LOA / 2 - station


def y_to_station(y: float) -> float:
    """Inverse of `station_to_y`."""
    return LOA / 2 - y

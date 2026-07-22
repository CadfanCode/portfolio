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

COACHROOF_START = 3.100
COACHROOF_END = COCKPIT_START
"""The coachroof runs from the foredeck back to the cockpit. Cross-check: the
mast steps on the coachroof (F.7.1) at station 3450, which lands comfortably
inside this span. If the coachroof were placed wrongly, that would not hold."""

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
    (2.840, 0.400),
    (COACHROOF_START, 0.400),
    (3.300, 0.500),
    (3.700, 0.560),
    (4.200, 0.590),
    (4.700, 0.600),
    (COACHROOF_END, 0.600),
]

COACHROOF_NOSE_FADE = 0.260
"""Over how much of its forward end the coachroof rises out of the deck.

The roof does not start at a wall. It grows out of the raised deck just abaft
the step, which is what makes the two read as one moulding -- and what the
brochure's "djarva formen" is: a wedge, not a box set down on a deck."""

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
    (COACHROOF_START, 0.012),
    (3.400, 0.085),
    (4.200, 0.111),
    (COACHROOF_END, 0.130),
]
"""A low crown on top of the raised deck, not a trunk standing on a flat one.

Twice reduced early on, and for the same reason both times: height that was
being asked of the coachroof actually belonged to the deck underneath it. First
CABIN_BAND was missing, then the step in it was. Once both were there the
remainder was measured rather than guessed, and came out taller than the 86 mm
that was left standing after those two corrections -- the deck below is right
now, so the swelling above it can have its real height back."""

COMPANIONWAY_RAISE_FORWARD = 3.450
"""Where the raised section over the companionway dies out: the mast.

The same number as MAST_STATION, which rule F.2.2 fixes at 3450 +/- 20 mm.
Written out again rather than read from it because the deck block is evaluated
before the rig block -- if the mast moves, this moves with it."""

COMPANIONWAY_RAISE = [
    # How far the raised section over the companionway stands above the
    # coachroof around it. Full at the after end, where the hatch garage and the
    # way below need the height, and tapering out forward to nothing at the mast.
    (COMPANIONWAY_RAISE_FORWARD, 0.000),
    (3.900, 0.070),
    (4.400, 0.155),
    (4.850, 0.212),
    (COACHROOF_END, 0.226),
]
"""The second tier: a flat-topped centre panel standing above the coachroof,
with a shoulder sloping down to the coachroof either side of it.

This is what makes the after end of the cabin top read as a structure rather
than a swelling -- it is the part you look straight at from the cockpit stop,
and the only part of the deck the camera path ever gets close to."""

COMPANIONWAY_RAISE_WIDTH = 2 / 3
"""Half-width of that flat top, as a fraction of the coachroof's own half-width.

A fraction rather than a dimension so the shoulder either side never runs out of
room: the coachroof narrows to 400 mm at its nose, and an absolute centre panel
of about that width would leave the shoulder nothing to slope over and collapse
three of the section's points onto one another."""

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
COMPANIONWAY_DEPTH = 0.520
"""The way below, in the aft face of the coachroof."""

SAILBOX_START = 0.950
SAILBOX_END = 1.850
SAILBOX_HALF_WIDTH = 0.310
"""The drained anchor/sail locker let into the foredeck -- "Langst fram i foren
hittar du en verklig dranerad ankarbox" (brochure p3). It arrived with the 1975
deck, so a 1980 boat has it, and its flush lid is why the foredeck reads as
clean: "det sticker inte upp nagra kanter eller beslag du kan snubbla pa"."""

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


# --- Rig ------------------------------------------------------------------

MAST_STATION = 3.450
"""Stem point to the front face of the mast. Rule F.2.2: 3450 +/- 20 mm."""

FORETRIANGLE_BASE = 3.335
"""J. Rule F.2.2: 3335 +/- 10 mm. Agrees with the published IOR J of 10.9 ft."""

LOWER_BAND_ABOVE_SHEER = 1.360
"""Boom-height datum: the lower measurement band sits this far above the sheer
line (top of the rubrail). Rule F.2.2: 1360 +/- 25 mm."""

MAINSAIL_HOIST = 7.500
"""P, lower band to upper band. Rule C.6.1 gives max 7500 mm; matches IOR
P of 24.6 ft."""

BOOM_LENGTH = 2.500
"""E, mast aft face to the boom band. Rule C.6.1 max 2500 mm; matches IOR E."""

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

SAIL_COVER = True
"""A cover flaked over the boom. The boat sits at anchor in the scene -- GUIDE
defers sailing mode to a later phase -- and a bare boom reads as unfinished
where a covered one reads as moored."""


# --- Sails (built, but disabled by default) -------------------------------

MAINSAIL_LEECH = 7.800
"""Rule G.4.3: 7722-7880 mm. Mid-range."""

GENOA1_LUFF = 9.120
"""Rule G.5.3: 9026-9210 mm. Mid-range. Also sets the forestay length."""

GENOA1_LEECH = 8.620
"""Rule G.5.3: 8536-8710 mm."""

GENOA1_FOOT = 5.315
"""Rule G.5.3: 5263-5370 mm."""


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

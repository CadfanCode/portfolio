"""
The deck moulding: foredeck, coachroof, side decks and cockpit.

This is the recognisability step. The hull underneath is shared with a lot of
1970s pocket cruisers; what makes a Maxi 77 look like a Maxi 77 is the deck --
long, low and flat, with almost no superstructure and unusually wide side decks.

Built as two lofted surfaces rather than one:

    forward   the stem back to the aft face of the coachroof
    aft       the coachroof aft face back to the transom, containing the cockpit

Splitting them there keeps each with a single consistent cross-section, which a
one-piece deck could not have -- the forward half needs a raised coachroof in
the middle, the aft half a sunken cockpit in the same place.

Within each half the section keeps a fixed point count and features fade out by
collapsing rather than by changing topology. The coachroof shrinks to nothing at
its forward end, and the cockpit does the same aft of it, so both fair into the
surrounding deck the way a GRP moulding does instead of stopping at a hard edge.
"""

import params
from lib.curves import Curve
from lib.mesh import (
    cap_loop,
    face_towards,
    grid_to_mesh,
    join,
    mirror_x,
    recalc_normals,
    shade_smooth,
    transom_loop,
)


TOP_POINTS = 7
"""Points across the coachroof top, or the cockpit sole, centreline outwards."""

ROOF_CENTRE_POINTS = 5
ROOF_SHOULDER_POINTS = 2
"""How the coachroof's `TOP_POINTS` are split once the raised section over the
companionway is on it: across its flat top, then down the shoulder to the
coachroof edge. They still sum to `TOP_POINTS`, so the roof carries the raised
section without costing the mesh a single vertex."""

SIDE_POINTS = 4
"""Points up a coachroof side or a cockpit well side."""

DECK_POINTS = 6
"""Points across a side deck."""

SEAT_DECK_MARGIN = 0.055
SEAT_NOSE = 0.020
COAMING_RISE = 0.045
"""The three half-offsets the cockpit well is built from: how far inboard of the
deck edge the seat top has to stop where the well is wider than the deck can
give it, how much of the seat's inboard edge is rounded over into the footwell,
and how far outboard the well side takes to climb from the seat to the side
deck.

Named because they are read from four places -- the section that builds the
well, the seat the bench lids lie on, the widths the grating and the rails are
cut to, and the checks that measure all of it. As literals in `_aft_section`
they were the sort of number that gets changed in one place and not the other
three, and the failure is a lid laid 20 mm off the seat it belongs to."""


def build(collection):
    """Build the deck. Returns a dict of named objects."""
    sheer = Curve(params.SHEER)
    half_beam = Curve(params.HALF_BEAM)

    frame, pane = _build_forehatch(collection, sheer, half_beam)

    # The two halves of the deck meet at the coachroof's aft face, and each
    # hands back the section it stops at so that face can be built to fit them
    # both -- with the companionway cut through it.
    deck_fwd, fwd_ring = _build_forward(collection, sheer, half_beam)
    deck_aft, aft_ring = _build_aft(collection, sheer, half_beam)

    return {
        "deck_fwd": deck_fwd,
        "deck_aft": deck_aft,
        "companionway": _build_companionway(collection, fwd_ring, aft_ring),
        "companionway_frame": _build_companionway_frame(collection),
        "cockpit_lids": _build_cockpit_lids(collection, sheer, half_beam),
        "anchorbox": _build_anchorbox(collection, sheer, half_beam),
        "forehatch": frame,
        "forehatch_pane": pane,
        "windows": _build_windows(collection, sheer, half_beam),
    }


def _lerp(a, b, t):
    return a + (b - a) * t


def _smoothstep(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def _sheer_edge(sheer, half_beam, station):
    """Where the deck meets the hull: the top of the hull skin, inboard of the
    rubrail, which is exactly where the hull's own sheer strake ends."""
    return max(0.0, half_beam(station) - params.RUBRAIL_PROUD), sheer(station)


def _camber(x, half_width, crown):
    """Deck crown at a given half-offset. Parabolic, zero at the sheer."""
    if half_width <= 0:
        return crown
    return crown * (1 - (x / half_width) ** 2)


MAX_HALF_BEAM = params.BEAM_AT_STATION / 2 - params.RUBRAIL_PROUD


def _crown(edge_x):
    """Camber at the centreline for a section of this half-beam.

    Held as a fixed proportion of local beam, the way a builder sets camber,
    rather than as one height everywhere. A constant crown puts the full 65 mm
    on the stem, where the deck is a hand's width across, and the bow ends in a
    spike instead of a point.
    """
    return params.DECK_CAMBER * max(0.0, edge_x) / MAX_HALF_BEAM


BAND_POINTS = 3
"""Points down the topside band, deck edge to rubrail."""


_CABIN_BAND = Curve(params.CABIN_BAND)
_COMPANIONWAY_RAISE = Curve(params.COMPANIONWAY_RAISE)


def companionway_raise(station, t_out=0.0):
    """How far the raised centre panel stands above whatever it is sitting on,
    at a fractional half-offset -- 0 on the centreline, 1 at the deck edge.

    Swept, exactly as `deck_lift` sweeps the step below it, and for the same
    reason: sweeping the *sample station* rather than the height gives every
    point the identical profile at a different moment, so the panel cannot come
    out a different height on the centreline than at its own edge.

    Sweeping it is what points the nose. The panel reaches nothing at the apex
    on the centreline and a `DECK_STEP_SWEEP` later at each offset outboard of
    it, so the line where it leaves the deck is a chevron on exactly the rake of
    the step's -- the panel noses forward to a point, over the point the raised
    deck already makes, instead of ending in a face across the front of it.

    The sweep runs the other way from `deck_lift`'s: that one is anchored at the
    deck edge and reaches furthest forward on the centreline, while this is
    anchored on the centreline, at the apex the other one arrives at. Same rake,
    same direction of lead, different end held still.
    """
    return _COMPANIONWAY_RAISE(station - params.DECK_STEP_SWEEP * t_out)


def companionway_lean(station, z):
    """How far forward a point sits because the coachroof's aft face leans.

    The face is a plane, tilted towards the bow about the companionway sill, and
    this is that plane expressed as a shear: `y += LEAN * (z - sill)`. Everything
    that has to lie in the face -- the last section of the forward deck, the
    first section of the cockpit, the doorway cut between them, the teak surround
    round the doorway -- calls this and lands on it, without any of them being
    told where the others are.

    A shear rather than a rotation because the face is not a separate panel. It
    is the seam between the two halves of the deck moulding, and rotating a seam
    tears it: the two halves have to agree about where every point on it is, and
    the only way to guarantee that is for both to ask the same question.

    Faded in over `COMPANIONWAY_LEAN_START` to the cockpit, and back out again
    over the bridgedeck, so the shear is a local deformation of the moulding
    rather than a lean applied to the whole boat. Both fades are gentle enough
    that no station ever passes another: the forward one compresses the roof's
    stations by at most 13%, and the after one only stretches them.

    Sheared about the sill rather than about the deck, which is the choice that
    keeps the doorway straight. Pivoting on the deck edge would leave the part of
    the face below it -- most of the doorway -- standing upright, with a crease
    across the middle of the way below.
    """
    rise = z - params.COMPANIONWAY_SILL
    if rise <= 0.0:
        return 0.0

    if station <= params.COMPANIONWAY_LEAN_START:
        return 0.0
    if station <= params.COCKPIT_START:
        span = params.COCKPIT_START - params.COMPANIONWAY_LEAN_START
        fade = _smoothstep((station - params.COMPANIONWAY_LEAN_START) / span)
    elif station < params.COCKPIT_FOOTWELL_START:
        span = params.COCKPIT_FOOTWELL_START - params.COCKPIT_START
        fade = _smoothstep((params.COCKPIT_FOOTWELL_START - station) / span)
    else:
        return 0.0

    return params.COMPANIONWAY_LEAN * rise * fade


def companionway_raise_width(station):
    """Half-width of the raised panel, as a fraction of the coachroof's own.

    Straight-line taper, not eased. The shoulder either side of the panel is a
    moulded gable with a crease down each edge of it, and those creases want to
    be straight in plan for the same reason they are straight in section.
    """
    span = params.COACHROOF_END - params.COMPANIONWAY_RAISE_FORWARD
    t = (station - params.COMPANIONWAY_RAISE_FORWARD) / span
    t = max(0.0, min(1.0, t))
    return _lerp(
        params.COMPANIONWAY_RAISE_WIDTH_FORWARD,
        params.COMPANIONWAY_RAISE_WIDTH,
        t,
    )


def band_height(station):
    """How far the deck edge stands above the rubrail at a station.

    Forward of the cockpit this is the cabin side, deepening aft as it goes --
    which is what keeps the deck line level while the rubrail below it falls
    away. Aft of the cockpit bulkhead it drops to a coaming. The drawing shows
    that step as a short ramp rather than a cliff, so it is ramped here too.
    """
    ramp = 0.240

    if station <= params.COCKPIT_START:
        return _CABIN_BAND(station)
    if station >= params.COCKPIT_START + ramp:
        return params.AFT_BAND

    t = _smoothstep((station - params.COCKPIT_START) / ramp)
    return _lerp(_CABIN_BAND(params.COCKPIT_START), params.AFT_BAND, t)


def _band_points(edge_x, edge_z, station):
    """The band, walked downwards from the deck edge to the rubrail.

    Returned separately from the deck because every section ends with it, and
    because the windows need to sit on exactly this surface.
    """
    height = band_height(station)
    deck_x = max(0.0, edge_x - params.BAND_TUMBLE)

    points = []
    for i in range(1, BAND_POINTS + 1):
        t = i / BAND_POINTS
        points.append((_lerp(deck_x, edge_x, t), edge_z + height * (1 - t)))
    return points


def deck_edge(edge_x, edge_z, station):
    """Top of the band: where the deck surface actually starts."""
    return max(0.0, edge_x - params.BAND_TUMBLE), edge_z + band_height(station)


def deck_edge_half_width(station):
    """Where the deck surface stops and the topside band turns down.

    Anything stood on a side deck -- a stanchion, a pulpit foot, a winch -- is
    placed inboard of this rather than off `HALF_BEAM`, because the beam curve
    is measured to the outside of the rubrail and there is 36 mm of rail and
    tumblehome between that and anywhere you can put a bolt.
    """
    sheer = Curve(params.SHEER)
    half_beam = Curve(params.HALF_BEAM)
    edge_x, _ = deck_edge(*_sheer_edge(sheer, half_beam, station), station)
    return edge_x


def deck_lift(station, t_out):
    """How far the deck stands above the rubrail, at a fractional half-offset --
    0 on the centreline, 1 at the deck edge.

    Everywhere except across the step this is just `band_height`. The step is
    the exception: it is a chevron, not a square wall, so a point out towards the
    sheer meets the same riser further aft. Sweeping the *sample station* rather
    than the height is what makes that work -- every point gets the identical
    step profile, only at a different moment, so the riser cannot come out a
    different height on the centreline than at the deck edge.

    Nothing is swept aft of the cockpit. The band drops to the aft coaming
    there, and a sample running into that drop would pull the forward deck's
    centreline down by 120 mm and tear it away from the aft half where the two
    meet.
    """
    if station >= params.COCKPIT_START:
        return band_height(station)

    swept = station + params.DECK_STEP_SWEEP * (1.0 - t_out)
    return band_height(min(swept, params.COCKPIT_START))


def band_surface_function():
    """Where the band's outer face is, by station and height.

    Returns None for heights outside the band. Used to paint the band, which
    needs an exact test rather than an approximate one: near the transom the
    band and the outer edge of the cockpit well end up barely a centimetre
    apart, and any "is it far enough outboard" rule paints one as the other.
    """
    sheer = Curve(params.SHEER)
    half_beam = Curve(params.HALF_BEAM)

    def surface(station, z):
        raw_x, raw_z = _sheer_edge(sheer, half_beam, station)
        height = band_height(station)
        if not raw_z - 0.002 <= z <= raw_z + height + 0.002:
            return None
        return _band_surface_x(raw_x, raw_z, station, z)

    return surface


def height_function():
    """Where a rig fitting lands: `height(station, x=0.0)`, over the whole boat.

    The mast is stepped on the coachroof and every stay foot lands on deck, so
    all of them have to follow whatever the deck is doing rather than being given
    heights of their own to drift out of step with. This is the one call that
    answers for both halves of the moulding, so nothing in `rig.py` has to know
    which half its own fitting is over.

    It used to answer for the forward half only, on the centreline only, and both
    limits had already cost something:

        Aft of the coachroof it answered with a coachroof. `COACHROOF_HEIGHT` and
        `COMPANIONWAY_RAISE` clamp to their end values outside their range, so it
        returned the after end of the roof no matter how far aft it was asked,
        and the backstay -- the one wire that lands back there -- was stepped
        356 mm above the after deck, in mid-air.

        On the centreline it answered with the centreline. The chainplates are
        950 mm off it, out on the side deck, and the deck is 150 mm lower there
        than the coachroof they were being hung from.
    """
    forward = surface_function()
    aft = cockpit_surface_function()

    def height(station, x=0.0):
        if station > params.COACHROOF_END:
            return aft(station, x)
        return forward(station, x)

    return height


def surface_function(thickness=0.0):
    """Height of the deck or coachroof surface, by station and half-offset.

    Read off the section the deck is actually built from and interpolated across
    it, so a fitting laid on the coachroof lands on the coachroof and not on the
    deck the coachroof is standing on.

    With a thickness it returns the underside instead, which is the cabin's
    ceiling. Same surface, read from the other side.
    """
    sheer = Curve(params.SHEER)
    half_beam = Curve(params.HALF_BEAM)
    roof_half = Curve(params.COACHROOF_HALF_WIDTH)
    roof_height = Curve(params.COACHROOF_HEIGHT)

    def height(station, x):
        section = _forward_section(station, sheer, half_beam, roof_half, roof_height)
        offsets = [abs(px) for (px, _, _) in section]
        heights = [pz - thickness for (_, _, pz) in section]

        x = abs(x)
        if x <= offsets[0]:
            return heights[0]

        for i in range(len(offsets) - 1):
            a, b = offsets[i], offsets[i + 1]
            if a <= x <= b and b > a:
                return _lerp(heights[i], heights[i + 1], (x - a) / (b - a))

        return heights[-1]

    return height


def forehatch_outline(inset=0.0):
    """The hatch's outline in plan, as `(half_offset, station)` pairs.

    A pentagon: an apex forward on the centreline, two edges running aft and
    outboard, then parallel sides to a square after edge. The apex is the deck
    step's own apex and the two forward edges run out along the step's chevron,
    so the hatch continues the lines already in the deck rather than sitting
    across them.

    `inset` shrinks the outline by that distance measured perpendicular to every
    edge -- a true offset, not a scale. That is what the frame needs: a band of
    constant width all the way round, including round the point, where the inset
    along the centreline is `inset / sin(half-angle)` rather than `inset`.
    """
    from math import sqrt

    apex, aft = params.FOREHATCH_APEX, params.FOREHATCH_END
    sheer, half_beam = Curve(params.SHEER), Curve(params.HALF_BEAM)

    # How far aft the step's arm falls per metre outboard. The chevron reaches
    # the sheer DECK_STEP_SWEEP abaft its apex, so this is the slope of the arm
    # -- and of the hatch's forward edges, which lie on it.
    edge_x, _ = deck_edge(*_sheer_edge(sheer, half_beam, apex), apex)
    ratio = params.DECK_STEP_SWEEP / edge_x if edge_x > 0 else 0.0

    half = params.FOREHATCH_HALF_WIDTH - inset
    nose = apex + inset * sqrt(1.0 + ratio * ratio)
    shoulder = nose + ratio * half
    tail = aft - inset

    return [
        (0.0, nose),
        (half, shoulder),
        (half, tail),
        (-half, tail),
        (-half, shoulder),
    ]


def underside_section(station, thickness):
    """The deck moulding's underside at a station: the cabin's ceiling.

    The forward deck section, dropped by the moulding's thickness. Built from
    the same `_forward_section` the deck itself is, for the reason
    `height_function` exists for the rig: the interior has to meet the real
    deck, and a ceiling given curves of its own drifts out of step with the
    roof above it the moment either is re-authored.

    Dropped vertically rather than offset along the surface normal. The deck is
    within a few degrees of horizontal everywhere the cabin is under it, so the
    two differ by less than the thickness itself.
    """
    section = _forward_section(
        station,
        Curve(params.SHEER),
        Curve(params.HALF_BEAM),
        Curve(params.COACHROOF_HALF_WIDTH),
        Curve(params.COACHROOF_HEIGHT),
    )
    return [(x, y, z - thickness) for (x, y, z) in section]


def _deck_surface(station, raw_z, edge_x, crown):
    """The deck surface of this section, as a function of half-offset.

    Shared by the deck builder and by `height_function`, which the rig reads to
    land the mast step and every stay foot on the deck. They have to agree: the
    swept step moves the centreline by a few millimetres, and a mast stepped on
    a separately-computed height would float that far off it.
    """

    def deck_at(x):
        t_out = x / edge_x if edge_x > 0 else 1.0
        return raw_z + deck_lift(station, t_out) + _camber(x, edge_x, crown)

    return deck_at


# --------------------------------------------------------------------------
# Forward half: foredeck, coachroof, side decks
# --------------------------------------------------------------------------


def _build_forward(collection, sheer, half_beam):
    roof_half = Curve(params.COACHROOF_HALF_WIDTH)
    roof_height = Curve(params.COACHROOF_HEIGHT)

    stations = _stations(0.0, params.COACHROOF_END, 130)
    rings = [
        _forward_section(s, sheer, half_beam, roof_half, roof_height)
        for s in stations
    ]

    obj = grid_to_mesh("deck_forward", rings, collection)
    mirror_x(obj)

    # The aft end is deliberately left open. It used to be capped here, and the
    # cockpit half capped its own forward end at the same station, which put two
    # coplanar panels in the same place -- and left nowhere for the companionway
    # to be cut. `_build_companionway` now closes both with one panel that has a
    # doorway in it. See `build`.

    recalc_normals(obj)
    shade_smooth(obj, sharp_above_degrees=32.0)
    return obj, rings[-1]


def _coachroof_presence(station):
    """How much of the coachroof's own camber applies at a station: 1 over its
    length, easing to 0 at its forward end so the roof takes on its flatter
    crown gradually instead of switching to it.

    It used to switch on, and with a 30 mm tumblehome and 8 mm of height nobody
    could see it. Given a real slope and a real height it showed at once: over
    one station the point distribution jumped from all-deck to a third-of-a-metre
    of roof, and the nose came out as a fold with a crease running away from it.

    The roof's *height* is no longer faded by this -- `COACHROOF_HEIGHT` starts
    at zero and eases itself in. Fading a height in on top of a curve that
    already starts at zero only bends the gradient, and a bent gradient in the
    middle of the nose is the swelling this was supposed to prevent.
    """
    fade = params.COACHROOF_NOSE_FADE

    if station < params.COACHROOF_START:
        return 0.0
    if station < params.COACHROOF_START + fade:
        return _smoothstep((station - params.COACHROOF_START) / fade)
    if station <= params.COACHROOF_END:
        return 1.0
    return 0.0


def _coachroof_half_width(roof_half, station, edge_x):
    """Half-width of the coachroof top, held continuous fore and aft of it.

    Held rather than dropped to zero outside the coachroof, because this width
    only places the section's points once the roof has faded out -- and points
    that jump from one station to the next crease a lofted surface whether or
    not there is any height on them. `Curve` holds the end values of its own
    accord, so there is nothing to clamp here.

    Kept clear of the sheer, so a side deck always survives.
    """
    return max(0.0, min(roof_half(station), edge_x - 0.170))


def _forward_section(station, sheer, half_beam, roof_half, roof_height):
    """One transverse section: centreline over the coachroof, down its side,
    out across the side deck, then down the topside band to the rubrail.

    Every height inboard of the sheer comes from `deck_at`, which carries the
    swept step. That is what turns a straight riser into a chevron: the section
    itself never changes shape, it just meets the step at a different station at
    each half-offset."""
    raw_x, raw_z = _sheer_edge(sheer, half_beam, station)
    edge_x, _ = deck_edge(raw_x, raw_z, station)

    presence = _coachroof_presence(station)
    rw = _coachroof_half_width(roof_half, station, edge_x)
    rh = roof_height(station)

    crown = _crown(edge_x)
    deck_at = _deck_surface(station, raw_z, edge_x, crown)
    flare = params.COACHROOF_SIDE_FLARE
    points = []

    def roof_at(x):
        """The coachroof top at a half-offset, before the raised section.

        Cambered like the deck, just less -- and blended back to the deck's own
        camber as the roof fades out, so at presence zero these points land
        exactly on the deck instead of leaving a flatter-cambered plateau
        sitting in it.

        Its base is the deck at the coachroof's own half-width, so the whole
        roof rides on the swept step rather than cutting across it.
        """
        roof_crown = _camber(x, rw, crown * 0.45) if rw > 0 else 0.0
        deck_crown = deck_at(x) - deck_at(rw)
        return deck_at(rw) + rh + _lerp(deck_crown, roof_crown, presence)

    # Flat top of the raised section over the companionway. It keeps the roof's
    # own camber -- this is a panel lifted off the coachroof, not a level plate
    # laid on it. The two share a forward end at the step's apex, so there is
    # nowhere the panel is standing on anything but coachroof.
    def lift_at(x):
        """The panel's rise at a half-offset, on the same sweep as the step."""
        return companionway_raise(station, x / edge_x if edge_x > 0 else 0.0)

    lift_half = rw * companionway_raise_width(station)

    for i in range(ROOF_CENTRE_POINTS):
        t = i / (ROOF_CENTRE_POINTS - 1)
        x = lift_half * t
        points.append((x, roof_at(x) + lift_at(x)))

    # Shoulder, sloping down from that top to the coachroof edge. Straight, not
    # eased: a moulded gable with a crease at each end of it, which the 32-degree
    # sharp-edge threshold then keeps as a crease. The lift is swept, so near the
    # nose it is already zero out here while the centreline still has some, and
    # the gable closes itself down to nothing without being told to.
    for i in range(1, ROOF_SHOULDER_POINTS + 1):
        t = i / ROOF_SHOULDER_POINTS
        x = _lerp(lift_half, rw, t)
        points.append((x, roof_at(x) + lift_at(x) * (1 - t)))

    # Coachroof side, sloping out and down to meet the side deck. Landed on
    # `deck_at(x)` rather than on the roof's base height, so the foot of the
    # slope *is* the deck: at 75 mm of flare the difference between the two is a
    # step you can see, where at the 30 mm this replaced it was hidden.
    for i in range(1, SIDE_POINTS + 1):
        s = _smoothstep(i / SIDE_POINTS)
        x = rw + flare * s
        points.append((x, deck_at(x) + rh * (1 - s)))

    # Side deck, out to the sheer.
    base_x = rw + flare
    for i in range(1, DECK_POINTS + 1):
        t = i / DECK_POINTS
        x = _lerp(base_x, edge_x, t)
        points.append((x, deck_at(x)))

    # Down the band to the hull, where the deck moulding meets the rubrail.
    points.extend(_band_points(raw_x, raw_z, station))

    y = params.station_to_y(station)
    return [(x, y + companionway_lean(station, z), z) for (x, z) in points]


# --------------------------------------------------------------------------
# Aft half: cockpit well and afterdeck
# --------------------------------------------------------------------------


def _build_aft(collection, sheer, half_beam):
    stations = _stations(params.COACHROOF_END, params.LOA, 46)
    rings = [_aft_section(s, sheer, half_beam) for s in stations]

    obj = grid_to_mesh("deck_aft", rings, collection)
    mirror_x(obj)

    # Forward end left open for the companionway panel; the transom is closed.
    cap_loop(obj, transom_loop(rings[-1]))

    recalc_normals(obj)
    shade_smooth(obj, sharp_above_degrees=32.0)
    return obj, rings[0]


def cockpit_widths(station, edge_x=None):
    """The three half-offsets across the cockpit at a station:

        footwell    where the sole stops and the seat's rounded nose begins
        seat        where the seat top stops and the well side starts climbing
        coaming     the top of that climb -- the inboard edge of the side deck

    The one definition, so that everything laid in or on the well is cut to the
    well the deck actually has. The footwell width is what the grating is planked
    to and what the after locker lid is sized from; the coaming is what the stern
    rail runs along and what the winches stand outboard of. All four move
    together whenever the beam curve or `COCKPIT_WIDTH` does.

    `edge_x` is the deck edge, passed in by the section builder because it has
    already worked it out. Anything else can leave it out.
    """
    if edge_x is None:
        edge_x, _ = deck_edge(
            *_sheer_edge(Curve(params.SHEER), Curve(params.HALF_BEAM), station),
            station,
        )

    seat = min(params.COCKPIT_WIDTH / 2, edge_x - SEAT_DECK_MARGIN)
    footwell = max(0.0, seat - params.COCKPIT_SEAT_WIDTH)
    return footwell, seat, seat + COAMING_RISE


def aft_deck_function():
    """The after deck moulding, as though the well had never been cut into it.

    What anything lying *on* the coaming is resting on: the stern rail, and the
    winches on the strip of side deck outboard of it. `cockpit_surface_function`
    is the wrong question for those, because the well side falls 400 mm over the
    45 mm between the coaming and the seat -- so a rail placed a centimetre
    inboard of the coaming, which is where it has to be at the after end where
    there is no side deck left, gets a height a third of the way down into the
    cockpit and follows it there.
    """
    sheer = Curve(params.SHEER)
    half_beam = Curve(params.HALF_BEAM)

    def height(station, x):
        raw_x, raw_z = _sheer_edge(sheer, half_beam, station)
        edge_x, edge_z = deck_edge(raw_x, raw_z, station)
        return edge_z + _camber(min(abs(x), edge_x), edge_x, _crown(edge_x))

    return height


def cockpit_surface_function():
    """Height of the after moulding -- sole, seat, coaming or side deck -- by
    station and half-offset.

    The cockpit's answer to `surface_function`, and built the same way: read the
    section the well is actually lofted from and interpolate across it. Anything
    that sits in the cockpit asks this rather than reconstructing the drops from
    `COCKPIT_SOLE_BELOW_SHEER` and friends, because there are four of those and
    a fitting that gets one of them wrong lands somewhere plausible.
    """
    sheer = Curve(params.SHEER)
    half_beam = Curve(params.HALF_BEAM)

    def height(station, x):
        section = _aft_section(station, sheer, half_beam)
        offsets = [abs(px) for (px, _, _) in section]
        heights = [pz for (_, _, pz) in section]

        x = abs(x)
        if x <= offsets[0]:
            return heights[0]

        for i in range(len(offsets) - 1):
            a, b = offsets[i], offsets[i + 1]
            if a <= x <= b and b > a:
                return _lerp(heights[i], heights[i + 1], (x - a) / (b - a))

        return heights[-1]

    return height


def _aft_section(station, sheer, half_beam):
    """One transverse section: centreline on the cockpit sole, out across the
    seat, up the well side, then the side deck to the sheer."""
    from math import radians, tan

    raw_x, raw_z = _sheer_edge(sheer, half_beam, station)
    edge_x, edge_z = deck_edge(raw_x, raw_z, station)

    # The transom rakes, so the aftmost sections lean forward with the hull.
    rake = 0.0
    fade_start = params.LOA - 1.600
    if station > fade_start:
        t = _smoothstep((station - fade_start) / 1.600)
        rake = t * tan(radians(params.TRANSOM_RAKE))

    # How much cockpit there is here: full through the well, fading at each end
    # so the sole rises into the afterdeck rather than stopping at a cliff.
    depth = _cockpit_presence(station)

    crown = _crown(edge_x)

    def deck_at(x):
        """The deck surface at a half-offset, before the well is cut into it."""
        return edge_z + _camber(x, edge_x, crown)

    seat_inner, seat_outer, _ = cockpit_widths(station, edge_x)

    # Everything in the well is a *drop below the deck*, never an absolute
    # height. That matters at the two ends, where the well fades out: measured
    # absolutely, the sole levelled off at the deck edge while the deck around
    # it stayed cambered, and the mismatch stood up as a thin wall along the
    # inboard edge of each side deck. Expressed as a drop, everything collapses
    # onto the deck exactly when the drop reaches zero.
    #
    # The well side tops out flush with the side deck for the same reason. It
    # used to carry on past it into a raised coaming, but with no thickness
    # modelled that came out as an 8 mm blade standing 90 mm proud of the deck,
    # tapering to a spike where the well faded out at the transom -- a fin, not
    # a coaming. A coaming worth having needs a section of its own.
    seat_drop = params.COCKPIT_SEAT_BELOW_SHEER * depth

    # The sole only drops away from the benches inside the footwell. Forward and
    # aft of it it comes back up, and that is the whole trick to getting seating
    # right round the well: the after bench and the forward step are not extra
    # objects sitting in the cockpit, they are the cockpit sole declining to go
    # all the way down. Expressed this way they fair into the side benches
    # automatically, because at the corners the drops are the same number.
    #
    # The two ends do not come up to the same place. Aft it is a bench and stops
    # at seat height; forward it is the step to the companionway, and that stops
    # half way up to the sill -- see `_bridgedeck_level`.
    flat_drop = _lerp(
        seat_drop,
        deck_at(0.0) - _bridgedeck_level(),
        _bridgedeck_presence(station),
    )
    sole_drop = _lerp(
        flat_drop,
        params.COCKPIT_SOLE_BELOW_SHEER * depth,
        _footwell_presence(station),
    )

    points = []

    # Cockpit sole, centreline out to the foot of the seat.
    for i in range(TOP_POINTS):
        t = i / (TOP_POINTS - 1)
        x = seat_inner * t
        points.append((x, deck_at(x) - sole_drop))

    # Seat face and seat top.
    for i in range(1, SIDE_POINTS + 1):
        s = _smoothstep(i / SIDE_POINTS)
        x = seat_inner + SEAT_NOSE * s
        points.append((x, deck_at(x) - _lerp(sole_drop, seat_drop, s)))
    points.append((seat_outer, deck_at(seat_outer) - seat_drop))

    # Well side, seat top up to the side deck.
    for i in range(1, SIDE_POINTS + 1):
        s = _smoothstep(i / SIDE_POINTS)
        x = seat_outer + COAMING_RISE * s
        points.append((x, deck_at(x) - _lerp(seat_drop, 0.0, s)))

    # Side deck outboard of the well, out to the sheer.
    base_x = seat_outer + COAMING_RISE
    for i in range(1, DECK_POINTS + 1):
        t = i / DECK_POINTS
        x = _lerp(base_x, edge_x, t)
        points.append((x, deck_at(x)))

    points.extend(_band_points(raw_x, raw_z, station))

    y = params.station_to_y(station)
    return [
        (x, y + rake * (raw_z - z) + companionway_lean(station, z), z)
        for (x, z) in points
    ]


def _cockpit_presence(station):
    """How deep the well is at a station: 1 through the cockpit, easing to 0
    abaft it. Keeps the after end of the well moulded rather than cut.

    There is no easing at the forward end. It used to fade in over 130 mm, and
    that was a guess made when there was nothing at that end for the deck to
    stop against. There is now: the coachroof's aft face, the bulkhead the
    companionway is cut through. A bulkhead is a cliff, and easing the deck into
    it left a 130 mm ramp of coachroof sloping down into the cockpit with the
    doorway hanging above it.
    """
    fade = 0.130

    if station < params.COCKPIT_START:
        return 0.0
    if station < params.COCKPIT_END - fade:
        return 1.0
    if station < params.COCKPIT_END:
        return _smoothstep((params.COCKPIT_END - station) / fade)
    return 0.0


def _bridgedeck_presence(station):
    """1 over the step at the forward end of the well, 0 everywhere else.

    The forward end of the cockpit is a step, not a bench. It is what you put a
    foot on going below, it is what the mainsheet horse stands on, and it is the
    one surface in the boat the inside and the outside both have to agree about
    -- see `_bridgedeck_level`.

    Faded out over the same 60 mm the footwell fades in over, so the two hand
    over to each other exactly and the sole never sees both at once.
    """
    fade = 0.060

    if station < params.COCKPIT_START:
        return 0.0
    if station <= params.COCKPIT_FOOTWELL_START:
        return 1.0
    if station < params.COCKPIT_FOOTWELL_START + fade:
        return 1.0 - _smoothstep(
            (station - params.COCKPIT_FOOTWELL_START) / fade
        )
    return 0.0


_BRIDGEDECK_LEVEL = None


def _bridgedeck_level():
    """Height of the step at the forward end of the well: half way between the
    footwell sole it rises out of and the companionway sill above it.

    Derived rather than fitted, because both of the things it sits between are.
    The sill comes off the cabin stairs -- four risers of 190 up from the sole --
    and the sole comes off `COCKPIT_SOLE_BELOW_SHEER`, so the step is the mean of
    two numbers that are already answerable to something else.

    It used to be the sill exactly, which put the whole 265 mm of the rise into
    one riser out of the footwell and left nothing to walk up. Two of 132 is a
    step and a threshold; one of 265 is a wall with a door in it.

    The sole is read at the step's own after edge, where the two meet, and the
    result is a constant -- which is what makes the step *level*. The moulding
    over it is not: the topside band drops 117 mm from the cockpit bulkhead to
    the after coaming in 240 mm of boat, and a step held at a fixed drop below
    that went down with it.

    Cached: it costs two curve builds and is read once per section of the after
    deck.
    """
    global _BRIDGEDECK_LEVEL

    if _BRIDGEDECK_LEVEL is None:
        sheer = Curve(params.SHEER)
        half_beam = Curve(params.HALF_BEAM)
        station = params.COCKPIT_FOOTWELL_START
        raw_x, raw_z = _sheer_edge(sheer, half_beam, station)
        edge_x, edge_z = deck_edge(raw_x, raw_z, station)
        sole = edge_z + _crown(edge_x) - params.COCKPIT_SOLE_BELOW_SHEER
        _BRIDGEDECK_LEVEL = (sole + params.COMPANIONWAY_SILL) / 2

    return _BRIDGEDECK_LEVEL


def _footwell_presence(station):
    """1 where the sole is down at sole level, 0 on the benches at either end.

    The fade is short on purpose. It is the front edge of a bench, and a bench
    front is a face, not a ramp -- 60 mm rounds the nose of it and no more.
    """
    fade = 0.060

    if station <= params.COCKPIT_FOOTWELL_START:
        return 0.0
    if station < params.COCKPIT_FOOTWELL_START + fade:
        return _smoothstep((station - params.COCKPIT_FOOTWELL_START) / fade)
    if station < params.COCKPIT_FOOTWELL_END - fade:
        return 1.0
    if station < params.COCKPIT_FOOTWELL_END:
        return _smoothstep((params.COCKPIT_FOOTWELL_END - station) / fade)
    return 0.0


# --------------------------------------------------------------------------
# Openings
# --------------------------------------------------------------------------


def _build_windows(collection, sheer, half_beam):
    """The cabin windows, let into the topside band.

    Long and low -- roughly 900 x 135 mm for the saloon light -- with the ends
    raked, which is what stops them reading as slots cut in a wall. They follow
    the band's own surface, inset, so they curve with the topsides instead of
    sitting flat on a curved boat.

    These are the single most recognisable thing about the boat, and the first
    version of this deck had none: the band they live in was read as a painted
    stripe rather than as structure.
    """
    objs = []

    for index, (forward, aft) in enumerate(params.WINDOWS):
        for side in (-1, 1):
            rings = []
            steps = 18

            for i in range(steps + 1):
                t = i / steps
                station = _lerp(forward, aft, t)
                raw_x, raw_z = _sheer_edge(sheer, half_beam, station)
                _, top_z = deck_edge(raw_x, raw_z, station)

                # Fill the band between its margins, so the window tapers with
                # it rather than hanging below the rubrail forward.
                full = max(
                    0.0,
                    band_height(station)
                    - params.WINDOW_MARGIN_TOP
                    - params.WINDOW_MARGIN_BOTTOM,
                )
                middle = top_z - params.WINDOW_MARGIN_TOP - full / 2

                # Rake the ends in, so the window is a lozenge, not a slot.
                taper = min(1.0, min(t, 1 - t) / 0.11)
                height = full * max(0.0, taper)

                # Follow the band's own surface, which leans inboard as it
                # rises, so the pane sits on the topsides rather than through
                # them.
                surface = _band_surface_x(raw_x, raw_z, station, middle)
                outer = side * (surface + params.WINDOW_PROUD)
                inner = side * (surface + params.WINDOW_PROUD - params.WINDOW_THICKNESS)

                y = params.station_to_y(station)
                top, bottom = middle + height / 2, middle - height / 2
                rings.append(
                    [(outer, y, top), (outer, y, bottom), (inner, y, bottom), (inner, y, top)]
                )

            name = f"window_{index}_{'p' if side < 0 else 's'}"
            obj = grid_to_mesh(name, rings, collection, close_rings=True)
            cap_loop(obj, rings[0])
            cap_loop(obj, rings[-1])
            recalc_normals(obj)
            shade_smooth(obj, sharp_above_degrees=25.0)
            objs.append(obj)

    return join(objs, "windows")


def _band_surface_x(raw_x, raw_z, station, z):
    """Half-beam of the band's outer face at a given height."""
    height = band_height(station)
    if height <= 0:
        return raw_x

    t = max(0.0, min(1.0, (raw_z + height - z) / height))
    return _lerp(max(0.0, raw_x - params.BAND_TUMBLE), raw_x, t)


def companionway_opening():
    """The doorway rectangle: `(half_width, sill, head)`.

    One definition, read by the panel that has the hole cut in it, by the teak
    frame that surrounds it, and by anything else that needs to know where the
    way below is. The sill comes off the cabin steps and the head off the
    deckhead, so both ends of the opening are tied to the thing on the other
    side of it rather than to a number of their own.
    """
    head = (
        height_function()(params.COACHROOF_END)
        - params.DECKHEAD_THICKNESS
        - params.COMPANIONWAY_HEAD_DROP
    )
    return params.COMPANIONWAY_WIDTH / 2, params.COMPANIONWAY_SILL, head


def _build_companionway(collection, fwd_ring, aft_ring):
    """The coachroof's aft face, with the way below cut through it.

    This is the bulkhead between the cockpit and the cabin, and it is the one
    panel on the boat that cannot be a lofted section or a capped loop: it needs
    a hole in it. So it is built as an annulus -- an outer boundary skinned to an
    inner one -- which is the only way to get a face with a hole without a
    boolean, and booleans are avoided here for the reasons `_recess` gives.

    The outer boundary is not invented. It is walked from the two rings either
    side of it: up the forward deck's last section over the coachroof, down the
    far side, then back along the cockpit's first section under the well. Taking
    the real rings rather than a fresh polygon is what stops this panel tearing
    away from the deck at its edges -- every vertex on its rim is a vertex the
    deck already has.

    Which leaves one question the annulus cannot dodge: which point on the
    doorway does each point on that boundary join to. See `_doorway_fan`.
    """
    outer = _face_boundary(fwd_ring, aft_ring)
    half, sill, head = companionway_opening()

    # The doorway leans with the face it is cut in. Both rings the outer boundary
    # is walked from are already sheared, so this is the same question asked a
    # third time rather than a second guess at the answer.
    station = params.COACHROOF_END
    y0 = params.station_to_y(station)

    def y_at(z):
        return y0 + companionway_lean(station, z)

    outer, inner = _doorway_fan(
        outer, (0.0, (sill + head) / 2), half, (head - sill) / 2, y_at
    )

    obj = grid_to_mesh("companionway", [outer, inner], collection, close_rings=True)
    face_towards(obj, (0.0, -1.0, 0.0))
    return obj


def _face_boundary(fwd_ring, aft_ring):
    """Walk the closed outline of the coachroof's aft face.

    Both rings run centreline outboard, so the walk is: up the starboard forward
    outline to the centreline, down the port one to the deck edge, back inboard
    along the port cockpit outline, and out along the starboard one to where it
    started.

    The band is dropped off both rings first. Below the deck edge the two are the
    *same three points* -- both halves call `_band_points` with the same station,
    so they agree exactly -- and a boundary that walks down one copy and back up
    the other is a boundary that doubles back on itself. It cost nothing at the
    time, because the face has no width down there anyway, and then it cost a
    great deal: see `_doorway_fan`, whose one assumption it breaks. Cut short at
    the deck edge, where both rings land on the same point, the walk closes
    cleanly and the panel stops where the panel actually stops.
    """

    def port(points):
        return [(-x, y, z) for (x, y, z) in points]

    fwd = fwd_ring[:-BAND_POINTS]
    aft = aft_ring[:-BAND_POINTS]

    return (
        list(reversed(fwd))  # starboard deck edge -> coachroof top
        + port(fwd[1:])  # -> port deck edge
        + port(list(reversed(aft[:-1])))  # -> port centreline, in the well
        + aft[1:-1]  # -> starboard, back to the start
    )


def _doorway_fan(outer, centre, half_width, half_height, y_at):
    """Pair each point on the panel's outline with the point on the doorway that
    lies on the same ray from the doorway's centre. Returns both loops.

    This is the whole panel. Skinning two loops joins point `i` to point `i`, so
    the correspondence *is* the topology, and getting it wrong does not fail --
    it produces a panel that looks built until the light catches it.

    It was wrong. The doorway used to be walked round by arc length and then
    rotated to whatever starting offset sat closest to the outline, which sounds
    reasonable and is not: the outline's points are spread wildly unevenly -- 20
    of them climbing one side of the coachroof, three down the topside band --
    and no single rotation can make an even walk match an uneven one. The fan
    twisted, the quads crossed each other, and since the whole panel is coplanar
    the overlaps came out as z-fighting speckle and dark streaks either side of
    the way below.

    A radial fan cannot cross itself, as long as the bearing from the doorway's
    centre only ever goes forwards. It nearly does: the outline sweeps a full
    turn, but along the side decks -- where the face has no width and the two
    rings are sampled differently -- it wanders back a few degrees. Those are
    forced forwards rather than trusted, which turns a would-be overlap into a
    zero-width quad the weld pass drops. What is *not* forgiven is a full lap
    backwards, which is what the doubled band section used to produce and what
    `_face_boundary` now removes at source: unwrapping it to the nearest branch
    of the previous bearing left the walk jumping a whole turn, and both bottom
    corners of the doorway were then inserted against a single 12 mm segment out
    at the rubrail, throwing two enormous faces across the way below.

    The four corners are put back by hand. Radial rays hit a rectangle's corners
    only by accident, and a doorway with its corners rounded off by however the
    outline happened to be sampled is not a doorway.
    """
    from math import atan2, cos, pi, sin

    cx, cz = centre
    tau = 2 * pi

    def bearing(point):
        return atan2(point[2] - cz, point[0] - cx)

    def on_doorway(theta):
        """Where a ray leaves the doorway rectangle."""
        dx, dz = cos(theta), sin(theta)
        reach = min(
            half_width / abs(dx) if abs(dx) > 1e-9 else float("inf"),
            half_height / abs(dz) if abs(dz) > 1e-9 else float("inf"),
        )
        z = cz + dz * reach
        return (cx + dx * reach, y_at(z), z)

    # Bearings round the outline: taken to the branch nearest the last one, then
    # held so the walk can never go backwards.
    angles = [bearing(outer[0])]
    for point in outer[1:]:
        theta = bearing(point)
        theta += tau * round((angles[-1] - theta) / tau)
        angles.append(max(theta, angles[-1]))
    angles.append(max(angles[0] + tau, angles[-1]))

    corners = sorted(
        angles[0] + (atan2(sz * half_height, sx * half_width) - angles[0]) % tau
        for sx in (-1, 1)
        for sz in (-1, 1)
    )

    ring_outer, ring_inner = [], []
    closed = outer + [outer[0]]
    corner = 0

    for i in range(len(outer)):
        ring_outer.append(closed[i])
        ring_inner.append(on_doorway(angles[i]))

        while corner < len(corners) and angles[i] < corners[corner] < angles[i + 1]:
            theta = corners[corner]
            ring_outer.append(_ray_meets(centre, theta, closed[i], closed[i + 1], y_at))
            ring_inner.append(on_doorway(theta))
            corner += 1

    return ring_outer, ring_inner


def _ray_meets(centre, theta, a, b, y_at):
    """Where a ray from `centre` crosses the segment `a`-`b`, in the panel plane.

    Solved rather than interpolated by angle. Some of these segments subtend a
    good fraction of a right angle -- the step across the bottom of the panel is
    one edge and half the width of the boat -- and on those an angular lerp puts
    the point visibly off the outline it is supposed to be on.
    """
    from math import cos, sin

    dx, dz = cos(theta), sin(theta)
    ex, ez = b[0] - a[0], b[2] - a[2]

    det = dx * ez - dz * ex
    if abs(det) < 1e-12:
        return a

    wx, wz = a[0] - centre[0], a[2] - centre[1]
    u = max(0.0, min(1.0, (wx * dz - wz * dx) / det))

    z = a[2] + ez * u
    return (a[0] + ex * u, y_at(z), z)


def _build_companionway_frame(collection):
    """The teak surround: two jambs, a head and a sill, standing proud of the
    aft face.

    Four boxes rather than a mitred sweep. They overlap at the corners, which is
    invisible and is what a mitre looks like anyway, and it keeps the piece
    describable in the four numbers it actually has.
    """
    half, sill, head = companionway_opening()
    w = params.COMPANIONWAY_FRAME_WIDTH
    station = params.COACHROOF_END
    proud = params.COMPANIONWAY_FRAME_PROUD

    # Standing proud on *both* faces, not just the one you look at from the
    # cockpit. It is a lining, and it is trimmed on the cabin side too -- which
    # matters here because the camera goes through this opening rather than
    # stopping at it. Built on one side only to begin with, and on the wrong one:
    # `station_to_y` runs backwards, so the frame that was meant to face the
    # cockpit ended up inside the saloon.
    y0, y1 = station - proud, station + proud

    pieces = [
        # Jambs, run past the head and sill so the corners are filled.
        ("jamb_p", -half - w, -half, sill - w, head + w),
        ("jamb_s", half, half + w, sill - w, head + w),
        ("head", -half, half, head, head + w),
        ("sill", -half, half, sill - w, sill),
    ]

    boxes = [
        _box_between(name, collection, y0, y1, x0, x1, z0, z1)
        for (name, x0, x1, z0, z1) in pieces
    ]
    frame = join(boxes, "companionway_frame")

    # Built square and then sheared into the face, rather than four boxes each
    # given a lean of its own. The shear is a linear function of z, so applying
    # it to the finished vertices is exact -- and it is the same function the
    # face and the doorway were built from, which is the only way four separate
    # pieces of trim end up in one plane.
    for vertex in frame.data.vertices:
        vertex.co.y += companionway_lean(station, vertex.co.z)

    return frame


def _box_between(name, collection, station_a, station_b, x0, x1, z0, z1):
    """An axis-aligned box, given as two stations, two half-offsets and two
    heights."""
    ya, yb = params.station_to_y(station_a), params.station_to_y(station_b)

    rings = [[(x0, ya, z), (x1, ya, z), (x1, yb, z), (x0, yb, z)] for z in (z1, z0)]

    obj = grid_to_mesh(name, rings, collection, close_rings=True)
    cap_loop(obj, rings[0])
    cap_loop(obj, list(reversed(rings[1])))
    recalc_normals(obj)
    return obj


def _anchorbox_half_width(station):
    """Half-width of the anchor box at a station: a straight taper to the stem.

    Straight, not parallel to the deck edge. The aperture is moulded into the
    deck with straight sides; the sheer beside it is a curve. They converge, and
    the margin between them narrows forward, which is what the photograph shows.
    """
    t = (station - params.ANCHORBOX_START) / (
        params.ANCHORBOX_END - params.ANCHORBOX_START
    )
    return _lerp(
        params.ANCHORBOX_HALF_WIDTH_FWD,
        params.ANCHORBOX_HALF_WIDTH_AFT,
        max(0.0, min(1.0, t)),
    )


def _foredeck_surface(sheer, half_beam, station):
    """The deck surface at a station on the foredeck, as a function of
    half-offset. The forward fittings all have to sit on it rather than on a
    flat plane through it."""
    raw_x, raw_z = _sheer_edge(sheer, half_beam, station)
    edge_x, _ = deck_edge(raw_x, raw_z, station)
    return _deck_surface(station, raw_z, edge_x, _crown(edge_x))


def _build_anchorbox(collection, sheer, half_beam):
    """The drained anchor locker, right forward in the bow.

    Its lid is flush -- the brochure makes a point that nothing stands proud of
    the foredeck to trip over -- so what shows is the seam around it, a trapezoid
    narrowing to the stem.

    The lid is moulded with the deck's own camber -- 11 mm of it across this
    width -- because a flat panel laid on a cambered deck rocks on its own
    centreline by exactly that much. So it is built as a surface, sampled off
    the deck below it and lifted, rather than as a plate.

    Only the lid is modelled. What is under it is a locker nobody ever opens
    from a fixed camera path, and the deck is an unbroken skin with nothing cut
    in it for a locker to be seen through.
    """
    spans = []
    for station in _stations(params.ANCHORBOX_START, params.ANCHORBOX_END, 7):
        deck_at = _foredeck_surface(sheer, half_beam, station)
        half = _anchorbox_half_width(station)
        # Symmetric about the centreline, so the surface is read at |x|.
        spans.append((station, -half, half, lambda x, d=deck_at: d(abs(x))))

    return _lid("anchorbox", collection, spans, params.ANCHORBOX_LID_PROUD)


def _lid(name, collection, spans, lift, across=5):
    """A panel lying on a surface and standing slightly proud of it.

    `spans` is a list of `(station, x0, x1, surface)`, where `surface` returns
    the height the lid sits on at a half-offset. Each ring runs from the surface
    at `x0`, up onto the lid, across it, and back down to the surface at `x1` --
    so there is a skirt at each edge, and it is the skirt that casts the seam.

    That seam is the entire point. Both the lids this builds are flush fittings
    on the real boat, and a flush lid in an uncut moulding is a lid that renders
    nothing at all: the deck is a single lofted skin with no hole in it for a
    recess to be seen through. Standing the lid a few millimetres proud is the
    cheapest honest way to get the line back.
    """
    rings = []
    for station, x0, x1, surface in spans:
        y = params.station_to_y(station)

        top, foot = [], []
        for i in range(across):
            x = _lerp(x0, x1, i / (across - 1))
            z = surface(x)
            top.append((x, y, z + lift))
            foot.append((x, y, z))
        rings.append(foot[:1] + top + foot[-1:])

    obj = grid_to_mesh(name, rings, collection)
    cap_loop(obj, rings[0])
    cap_loop(obj, list(reversed(rings[-1])))
    recalc_normals(obj)
    shade_smooth(obj, sharp_above_degrees=25.0)
    return obj


def _cockpit_seat(sheer, half_beam, station):
    """The cockpit seat top at a station: `(inner, outer, surface)`.

    Read back out of the same numbers `_aft_section` builds the well from, so a
    lid laid on the seat cannot end up laid on where the seat used to be.
    """
    raw_x, raw_z = _sheer_edge(sheer, half_beam, station)
    edge_x, edge_z = deck_edge(raw_x, raw_z, station)
    crown = _crown(edge_x)
    drop = params.COCKPIT_SEAT_BELOW_SHEER * _cockpit_presence(station)

    footwell, outer, _ = cockpit_widths(station, edge_x)
    inner = footwell + SEAT_NOSE

    def surface(x):
        return edge_z + _camber(x, edge_x, crown) - drop

    return inner, outer, surface


def _build_cockpit_lids(collection, sheer, half_beam):
    """The bench lids, and by implication the lockers under them.

    Three: one on each side bench, and one in the after bench. The brochure
    names two -- "Under bankarna i brunnen finns tva rejalt tilltagna
    utrymmen" -- and means the side pair; the third comes with the after bench,
    which is itself a departure from what the references show.
    """
    seam = params.COCKPIT_LID_SEAM
    lids = []

    # The side benches, port and starboard.
    stations = _stations(
        params.COCKPIT_LOCKER_START, params.COCKPIT_LOCKER_END, 5
    )
    for side in (-1, 1):
        spans = []
        for station in stations:
            inner, outer, surface = _cockpit_seat(sheer, half_beam, station)
            spans.append(
                (station, side * (inner + seam), side * (outer - seam), surface)
            )
        lids.append(
            _lid(f"lid_{side}", collection, spans, params.COCKPIT_LID_PROUD)
        )

    # The after bench, where the sole is up at seat height right across the well.
    #
    # Cut to the footwell rather than to the bench it lies in, and squared rather
    # than tapered with the well: it is a locker lid, and a locker lid is a
    # rectangle. The width comes from the footwell at the point the two meet, so
    # the lid's sides carry straight on from the sides of the well in front of it
    # -- which is the only line back here for it to line up with, and the reason
    # it looked like a panel dropped in the boat when it ran the full width of
    # the bench instead.
    aft_end = params.COCKPIT_END - 0.130
    half = cockpit_widths(params.COCKPIT_FOOTWELL_END)[0] - seam

    spans = []
    for station in _stations(
        params.COCKPIT_FOOTWELL_END + seam, aft_end - seam, 4
    ):
        _, _, surface = _cockpit_seat(sheer, half_beam, station)
        spans.append((station, -half, half, surface))
    lids.append(_lid("lid_aft", collection, spans, params.COCKPIT_LID_PROUD))

    return join(lids, "cockpit_lids")


def _build_forehatch(collection, sheer, half_beam):
    """The glazed hatch on the coachroof nose, forward of the mast.

    A low frame standing proud of the moulding with a smoked acrylic pane in it
    -- the same material as the cabin windows, and for the same reason: it is
    the only daylight the forward end of the cabin gets.

    Two nested pentagons: the frame's outside, and the aperture inside it, inset
    perpendicular to every edge so the band is the same width all the way round
    including round the point.
    """
    outer = forehatch_outline()
    inner = forehatch_outline(params.FOREHATCH_FRAME_WIDTH)
    surface = surface_function()

    proud = params.FOREHATCH_FRAME_PROUD
    rebate = proud * 0.35
    plane = _forehatch_plane(outer, surface, proud)

    def ring(outline, lift):
        return [
            (
                x,
                params.station_to_y(station),
                surface(station, x) if lift is None else plane(station) + lift,
            )
            for (x, station) in outline
        ]

    frame_rings = [
        ring(outer, None),  # foot, on the coachroof
        ring(outer, 0.0),  # head, on the hatch's own plane
        ring(inner, 0.0),  # in to the aperture
        ring(inner, rebate - proud),  # down to the glazing rebate
    ]

    frame = grid_to_mesh("forehatch", frame_rings, collection, close_rings=True)
    recalc_normals(frame)

    top = ring(inner, rebate - proud)
    pane_rings = [top, [(x, y, z - 0.008) for (x, y, z) in top]]
    pane = grid_to_mesh("forehatch_pane", pane_rings, collection, close_rings=True)
    cap_loop(pane, pane_rings[0])
    cap_loop(pane, list(reversed(pane_rings[1])))
    recalc_normals(pane)

    return frame, pane


def _forehatch_plane(outline, surface, proud):
    """The plane the hatch lies in: `f(station) -> height of its top`.

    A hatch is a rigid moulding, so its top is flat -- but "flat" is not the
    same as "level". The coachroof rises 70 mm from the hatch's point to its
    after edge, and a level frame laid on that is a frame perched on a wedge,
    92 mm proud at the point and 22 mm at the back. It looked exactly like what
    it was: a rectangle dropped onto a slope.

    So the plane is tilted to the roof, taken through the surface at the point
    and at the after edge. Then it is lifted by however much the roof rises
    above it anywhere inside the footprint -- nothing, as the curves stand, but
    the check costs one sampling pass and the failure it prevents is a frame
    with the coachroof growing through the middle of it.
    """
    nose_x, nose_s = outline[0]
    tail_x, tail_s = outline[2]
    span = tail_s - nose_s

    z_nose = surface(nose_s, nose_x)
    z_tail = surface(tail_s, tail_x)

    def raw(station):
        t = (station - nose_s) / span if span else 0.0
        return _lerp(z_nose, z_tail, t)

    half = params.FOREHATCH_HALF_WIDTH
    lift = 0.0
    for i in range(13):
        station = nose_s + span * i / 12
        for j in range(5):
            x = half * (2 * j / 4 - 1)
            lift = max(lift, surface(station, x) - raw(station))

    return lambda station: raw(station) + lift + proud


def _stations(start, end, count):
    """Even station spacing over a span, both ends included."""
    step = (end - start) / (count - 1)
    return [start + step * i for i in range(count)]

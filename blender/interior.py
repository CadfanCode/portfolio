"""
The accommodation: the moulded inner hull, and the ceiling over it.

From hull 700 on, a Maxi 77's interior is not built up out of plywood joinery
against the hull -- it is "ett innerskrov i plast", a second GRP moulding
dropped inside the first, carrying the sole, the settees and the berth flats as
one continuous surface. That is a gift to a model built this way: the liner is
a single lofted skin, exactly like the hull and the deck, described by what its
transverse section is doing at each station.

So the same technique deck.py uses applies here. Fixed point count in every
section, and features fade in and out by collapsing points rather than by
changing topology: the forepeak berth flat *is* the saloon sole and settees
with the sole width taken to zero and the settee front dropped flat. Between
the two bulkheads one becomes the other over 380 mm, which is a moulding
fairing from one shape into another, not a joint.

The galley to port and the quarter berth to starboard are not built here. They
live in joinery.py, which is the right place for them: on the real boat they are
the parts that are *not* the liner.

The liner itself does have to be asymmetric in one respect, which is why its
sections are built full width rather than as a half section mirrored across the
centreline. The port settee stops where the galley starts -- see
SETTEE_RUN_END -- and the sole runs out to the hull under the worktop instead.
Mirrored, it could not: the settee ran on under the galley and out past it to
the foot of the companionway steps, which put a 400 mm shelf of white moulding
in the one place someone coming below has to put their feet.
"""

import deck
import params
from lib.curves import Curve, section_half_beam
from lib.mesh import bevel, cap_loop, grid_to_mesh, mirror_x, recalc_normals


HULL_POINTS = 5
"""Points up the hull side of a liner section, from the seat top to the sheer."""

BILGE_POINTS = 4
"""Points up the hull between the outboard edge of the sole and the foot of the
settee front, where the hull is narrower down there than the sole is wide.

Over most of the saloon it is. At the after bulkhead the hull is 1540 mm wide at
seat height and 630 at sole height, so a settee front standing 485 mm off the
centreline has no sole under it -- it has hull, curving away below it into the
bilge, and the liner has to follow that curve down to where the flat of the sole
really stops. Four points do it to within the 2 mm the
clearance check in verify.py allows; the chords between them fall inside the
hull rather than outside it because the section is concave all the way up from
the keel.

Where the hull is wider than the sole -- aft, and anywhere the settee has run
out -- these collapse onto the edge of the sole and cost nothing, the same
trick every other feature in this section uses to fade."""

LINER_STATIONS = 52
DECKHEAD_STATIONS = 34

LINER_START = 0.350
LINER_END = params.QUARTER_BERTH_END
"""Forward of 350 the hull is too fine to have anything moulded into it. Aft it
runs to the end of the quarter berth, which is where the accommodation stops.

It used to stop at the cockpit's forward end, on the argument that abaft that
there is a cockpit well overhead rather than a cabin. True of the headroom and
false of the moulding: the quarter berth's flat runs on under the bridgedeck for
another 1.8 m and that flat *is* the liner. What the short version left was a
hole -- the last 450 mm of the way below had bare topsides beside it, and once
the port settee stopped covering them (see SETTEE_RUN_END) you could stand in
the cabin and look through the boat. Blender draws backfaces and three.js does
not, so what reads here as a blue wedge is open sky in the app."""

DECKHEAD_START = 0.700

SETTEE_RUN_END = {-1: params.GALLEY_START, 1: params.QUARTER_BERTH_START}
"""Where the settee stops, aft, on each side: -1 port, +1 starboard.

Port it stops at the galley, and this is the whole reason the liner is built
full width. Aft of the worktop's forward face there is no settee on that side --
the sole runs out to the hull and the galley stands on it -- so the space
between the worktop and the companionway steps is floor, which is what someone
coming below is expecting to find under their feet.

Starboard it stops where the quarter berth starts, and for a duller reason: the
berth is a block of its own with its top at settee height, so a settee running
on underneath it puts two faces in the same plane for 1.9 m. The end face is
inside the block rather than against its forward face, which is why the settee
ends *at* QUARTER_BERTH_START and not a millimetre before it."""

SETTEE_END_FACE = 0.004
"""How long the loft is given to close the settee off at SETTEE_RUN_END.

A lofted surface has no end faces -- it has stations -- so an end is two
stations 4 mm apart, one with the settee in section and one without. Read as a
vertical face at any distance anyone sees it from, and it costs one extra
station rather than a separate object cut to the hull."""


def build(collection):
    """Build the interior shell. Returns a dict of named objects."""
    inner = hull_inner_function()

    return {
        "liner": _build_liner(collection, inner),
        "deckhead": _build_deckhead(collection),
        "forehatch_light": _build_forehatch_light(collection),
    }


def hull_inner_function():
    """Half-width of the *inside* of the hull skin, by station and height.

    Everything in the accommodation is bounded by this: a settee top runs out
    to it, a bulkhead is cut to it, and nothing may cross it. Built from the
    same section curve as the hull, less the liner's own thickness, so it
    cannot drift away from the hull it is supposed to be inside.
    """
    sheer = Curve(params.SHEER)
    profile = Curve(params.PROFILE)
    half_beam = Curve(params.HALF_BEAM)
    fullness = Curve(params.SECTION_FULLNESS)
    tuck = Curve(params.SECTION_TUCK)

    def inner(station, z):
        skin = section_half_beam(
            max(0.0, half_beam(station) - params.RUBRAIL_PROUD),
            sheer(station),
            profile(station),
            fullness(station),
            tuck(station),
            z,
        )
        return max(0.0, skin - params.LINER_THICKNESS)

    return inner


_SHEER = Curve(params.SHEER)
_PROFILE = Curve(params.PROFILE)


def sheer_z(station):
    """Height of the sheer at a station -- where the liner stops and the deck
    moulding takes over."""
    return _SHEER(station)


def bilge_z(station):
    """The lowest the liner can go at a station: the inside of the hull on the
    centreline.

    Forward in the bow this rises fast -- the stem is above the waterline by
    station 700 -- and it is what stops the forepeak berth flat continuing into
    a part of the boat that has no inside. Left unclamped, the berth ran on to
    station 350 at a level 400 mm below the hull under it, and the sections
    crossed each other: the forepeak had a row of chevrons stacked down its
    centreline where the surface folded through itself."""
    return _PROFILE(station) + params.LINER_THICKNESS


def deckhead_function():
    """Height of the cabin ceiling, by station and half-offset.

    The deck's own surface, less the moulding's thickness. A bulkhead needs it
    across the whole width rather than on the centreline: the deckhead falls
    away from the coachroof to the side decks, so a panel cut square to the
    centreline height stands proud of the ceiling everywhere outboard of the
    coachroof -- which is what the first pair of bulkheads did, and they read as
    fins standing in the middle of the boat.
    """
    return deck.surface_function(params.DECKHEAD_THICKNESS)


def _lerp(a, b, t):
    return a + (b - a) * t


def _smoothstep(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def saloon_presence(station):
    """How much of the saloon's section this station has: 0 in the forepeak,
    1 in the saloon, fairing between them across the two bulkheads.

    The changeover happens *inside* the wardrobe compartment, where nothing can
    see it. That is not a convenience -- it is where the real moulding changes
    too, because the compartment between the bulkheads is the only place along
    the boat that is neither a berth flat nor a saloon sole.
    """
    if station <= params.BULKHEAD_FWD:
        return 0.0
    if station >= params.BULKHEAD_AFT:
        return 1.0
    return _smoothstep(
        (station - params.BULKHEAD_FWD)
        / (params.BULKHEAD_AFT - params.BULKHEAD_FWD)
    )


def floor_level(station):
    """Top of whatever you stand or lie on at a station: berth flat forward,
    cabin sole aft -- and the hull itself, right forward, where there is no
    room under either."""
    flat = _lerp(
        params.FOREPEAK_BERTH_LEVEL, params.SOLE_LEVEL, saloon_presence(station)
    )
    return max(flat, bilge_z(station))


def seat_level(station):
    """Top of the settee, or of the forepeak berth where there is no settee.

    Side-agnostic: it answers for the saloon, which is where anything laid on
    the seat -- a cushion, a backrest -- is built. Where a settee has run out
    altogether there is no seat to be on top of, and `settee_run` below is what
    the liner's own section asks instead."""
    seat = _lerp(
        params.FOREPEAK_BERTH_LEVEL, params.SETTEE_LEVEL, saloon_presence(station)
    )
    return max(seat, floor_level(station))


def settee_run(station, side):
    """Whether there is still a settee at a station on a given side: 1 or 0.

    Not faired, unlike `saloon_presence`. The forepeak changeover is a moulding
    fairing from one shape into another over 380 mm and belongs inside a
    compartment nobody sees; this one is where a settee stops, in full view of
    the companionway, and a settee that ramps down into the sole over half a
    metre is a wheelchair kerb rather than a piece of furniture."""
    return 0.0 if station > SETTEE_RUN_END[side] else 1.0


def _build_liner(collection, inner):
    """The moulded inner hull: sole, settee fronts and tops, forepeak berth."""
    rings = [_liner_section(s, inner) for s in _liner_stations()]

    obj = grid_to_mesh("liner", rings, collection)
    recalc_normals(obj)
    # The settee-front corners run the length of each settee as a genuine
    # right angle -- the one place on the liner that is not a fair loft -- and
    # are exactly the "knife edge" the owner's brief points at. Bevelled rather
    # than shaded: a real moulding cannot be pulled off one either.
    bevel(obj, width=0.003, segments=2, smooth_above_degrees=30.0)
    return obj


def _liner_stations():
    """Where the liner is cut, forward to aft.

    An even spread, plus a pair at each end of a settee run to close it off.
    Sorted and de-duplicated so those pairs can land anywhere without having to
    know what the even spread is doing near them."""
    stations = _stations(LINER_START, LINER_END, LINER_STATIONS)
    for end in SETTEE_RUN_END.values():
        stations += [end, end + SETTEE_END_FACE]
    return sorted(s for s in set(stations) if LINER_START <= s <= LINER_END)


def _liner_section(station, inner):
    """One transverse section of the liner, port sheer to starboard sheer.

    Full width rather than a half section mirrored, because the two sides are
    not the same shape aft: see the module docstring. Built as two halves all
    the same, walked outboard from the centreline, with the port one reversed
    and negated in front of the starboard one -- so the section is still
    described once and the point count is still fixed at every station.
    """
    port = _liner_half(station, inner, -1)
    starboard = _liner_half(station, inner, 1)

    # The centreline point belongs to both halves and is written once. Both
    # halves put it at `floor_level`, which has no side, so the two agree.
    points = [(-x, z) for (x, z) in reversed(port)] + starboard[1:]

    y = params.station_to_y(station)
    return [(x, y, z) for (x, z) in points]


def _liner_half(station, inner, side):
    """Half a section, as (half-offset, height) from the centreline outboard.

    Walked in order: the sole out from the centreline, the turn of the bilge up
    to the foot of the settee front, the front itself, the seat out to the hull,
    and the topsides above it to the sheer. Features fade by collapsing points
    rather than by dropping them, which is what keeps every ring the same
    length:

      - in the forepeak the sole's half-width goes to zero and the settee front
        loses its height, so the first three collapse onto the centreline and
        what is left is a flat berth running out to the hull;
      - abaft SETTEE_RUN_END the same three collapse the other way, onto the
        sole, and what is left is the sole itself running out to the hull.
    """
    floor_z = floor_level(station)
    top_z = sheer_z(station)

    run = settee_run(station, side)
    seat_z = _lerp(floor_z, seat_level(station), run)
    front_half = params.SOLE_HALF_WIDTH * saloon_presence(station) * run

    # The flat of the sole stops at the settee front or at the hull, whichever
    # comes first, and forward in the saloon it is the hull -- so the sole is
    # narrower there than SOLE_HALF_WIDTH asks for and the front stands on the
    # bilge instead. See BILGE_POINTS.
    foot_z = _hull_reaches(inner, station, front_half, floor_z, seat_z)

    points = [
        (0.0, floor_z),  # centreline, on the sole
        (min(front_half, inner(station, floor_z)), floor_z),  # edge of the sole
    ]

    # Up the turn of the bilge to the foot of the settee front. Collapses onto
    # the point above wherever the hull is already wider than the sole.
    for i in range(1, BILGE_POINTS + 1):
        z = _lerp(floor_z, foot_z, i / BILGE_POINTS)
        points.append((min(front_half, inner(station, z)), z))

    points.append((front_half, seat_z))  # top of the settee front

    # The seat runs out to the hull, and its depth is whatever that leaves --
    # 444 mm amidships. Not a chosen number: it is the hull's own half-beam at
    # seat height, less the walkway's share of it, and SOLE_HALF_WIDTH is the
    # only end of it anyone gets to pick.
    seat_out = max(front_half, inner(station, seat_z))
    points.append((seat_out, seat_z))

    # Up the hull side to the sheer, where the deck moulding takes over.
    for i in range(1, HULL_POINTS + 1):
        z = _lerp(seat_z, top_z, i / HULL_POINTS)
        points.append((inner(station, z), z))

    return points


def _hull_reaches(inner, station, half, z0, z1, steps=64):
    """The height at which the hull is `half` wide at a station, between two
    heights -- `z0` if it is already that wide down there.

    Scanned rather than solved, for the reason `joinery._floor` gives: the
    section curve is monotonic in z but its exponents move station to station,
    and a scan needs no assumptions about either. Its answer only has to be good
    enough to place a point that is then clamped to the hull anyway.
    """
    for i in range(steps + 1):
        z = _lerp(z0, z1, i / steps)
        if inner(station, z) >= half:
            return z
    return z1


def _build_deckhead(collection):
    """The underside of the deck and coachroof -- the cabin's ceiling, and below
    the deck edge the cabin's side.

    The side is the half of this nobody thinks of as ceiling and the half the
    saloon camera stop looks straight at: it is the wall the windows are in.
    `deck.underside_section` builds it, and it takes the same window openings
    the deck's own band does, off the same station list, so the two rims line up
    and `deck._build_reveals` can join them.
    """
    stations = deck.window_stations(
        _stations(DECKHEAD_START, params.COACHROOF_END, DECKHEAD_STATIONS)
    )
    rings = [
        deck.underside_section(s, params.DECKHEAD_THICKNESS) for s in stations
    ]

    obj = grid_to_mesh(
        "deckhead",
        rings,
        collection,
        skip=deck.band_aperture_skip(stations, len(rings[0])),
    )
    mirror_x(obj)
    recalc_normals(obj, inward=True)
    bevel(obj, width=0.002, segments=1, smooth_above_degrees=32.0)
    return obj


def _build_forehatch_light(collection):
    """The foredeck hatch, seen from below: a glazed panel in the deckhead.

    "I taket finns en lucka upp till fordack. Den ar forsedd med en ruta i
    rokfargad plexiglas sa du far in dagsljus" -- brochure p4, and it is the
    forepeak's only daylight, so it is the one thing in there worth having.

    A panel laid on the deckhead rather than a hole cut through it. The real
    hatch is an opening and this is not, but the deckhead is a lofted surface
    with a fixed section and cutting an aperture in it needs a boolean, for one
    pane that is only ever seen from directly underneath. CLAUDE.md is explicit
    about which way to resolve that: fake the cheap effect.
    """
    ceiling = deckhead_function()
    outline = deck.forehatch_outline(params.FOREHATCH_FRAME_WIDTH)

    # The hatch's own aperture, so the two cannot disagree about where the light
    # comes in -- including its shape, which is a pentagon and not a rectangle.
    # Sat 2 mm under the deckhead so it lies in the ceiling rather than in it.
    ring = [
        (x, params.station_to_y(station), ceiling(station, x) - 0.002)
        for (x, station) in outline
    ]

    obj = grid_to_mesh("forehatch_light", [ring, ring], collection)
    cap_loop(obj, ring)
    recalc_normals(obj, inward=True)
    return obj


def _stations(start, end, count):
    step = (end - start) / (count - 1)
    return [start + step * i for i in range(count)]

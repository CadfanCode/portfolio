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

What the liner cannot carry is anything asymmetric -- the galley to port, the
quarter berth to starboard -- because it is built as a half section and
mirrored. Those live in joinery.py, which is the right place for them anyway:
on the real boat they are the parts that are not the liner.
"""

import deck
import params
from lib.curves import Curve, section_half_beam
from lib.mesh import cap_loop, grid_to_mesh, mirror_x, recalc_normals, shade_smooth


HULL_POINTS = 5
"""Points up the hull side of a liner section, from the seat top to the sheer."""

LINER_STATIONS = 40
DECKHEAD_STATIONS = 34

LINER_START = 0.350
LINER_END = params.COCKPIT_START
"""Forward of 350 the hull is too fine to have anything moulded into it, and
abaft the cockpit's forward end there is a cockpit well overhead rather than a
cabin. Neither end is ever in shot; both are there so the surface closes."""

DECKHEAD_START = 0.700


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
    """Top of the settee, or of the forepeak berth where there is no settee."""
    seat = _lerp(
        params.FOREPEAK_BERTH_LEVEL, params.SETTEE_LEVEL, saloon_presence(station)
    )
    return max(seat, floor_level(station))


def _build_liner(collection, inner):
    """The moulded inner hull: sole, settee fronts and tops, forepeak berth."""
    stations = _stations(LINER_START, LINER_END, LINER_STATIONS)
    rings = [_liner_section(s, inner) for s in stations]

    obj = grid_to_mesh("liner", rings, collection)
    mirror_x(obj)
    recalc_normals(obj)
    shade_smooth(obj, sharp_above_degrees=30.0)
    return obj


def _liner_section(station, inner):
    """One transverse half-section of the liner, centreline outboard.

    Three points describe the sole and the settee front and two more the seat
    and the hull above it. In the forepeak the sole's half-width goes to zero
    and the settee front loses its height, so the first three collapse onto the
    centreline and what is left is a flat berth running out to the hull -- the
    same section, with the saloon taken out of it.
    """
    floor_z = floor_level(station)
    seat_z = seat_level(station)
    floor_half = params.SOLE_HALF_WIDTH * saloon_presence(station)
    top_z = sheer_z(station)

    points = [
        (0.0, floor_z),  # centreline, on the sole
        (floor_half, floor_z),  # inboard foot of the settee front
        (floor_half, seat_z),  # top of it
    ]

    # The seat runs out to the hull, and its depth is whatever that leaves --
    # about 540 mm amidships. Not a chosen number: the hull is 980 mm wide at
    # sole level here, and once the walkway has its half of that, the rest is
    # seat whether it is wanted or not.
    seat_out = max(floor_half, inner(station, seat_z))
    points.append((seat_out, seat_z))

    # Up the hull side to the sheer, where the deck moulding takes over.
    for i in range(1, HULL_POINTS + 1):
        z = _lerp(seat_z, top_z, i / HULL_POINTS)
        points.append((inner(station, z), z))

    y = params.station_to_y(station)
    return [(x, y, z) for (x, z) in points]


def _build_deckhead(collection):
    """The underside of the deck and coachroof -- the cabin's ceiling."""
    stations = _stations(DECKHEAD_START, params.COACHROOF_END, DECKHEAD_STATIONS)
    rings = [
        deck.underside_section(s, params.DECKHEAD_THICKNESS) for s in stations
    ]

    obj = grid_to_mesh("deckhead", rings, collection)
    mirror_x(obj)
    recalc_normals(obj, inward=True)
    shade_smooth(obj, sharp_above_degrees=32.0)
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

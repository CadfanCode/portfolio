"""
The soft fit-out: cushions, backrests, the shelf, locker doors, sink and cooker.

`interior.py` is the moulding and `joinery.py` is the panels. This is everything
that goes in after both of those -- the parts a boatbuilder fits last and an
owner replaces twice, and the parts that decide whether a cabin reads as a place
someone sleeps or as a plastic shell with furniture in it.

It is the same argument `fittings.py` makes about the cockpit, and it lands
harder below deck. The liner is one continuous GRP surface from sole to sheer:
without cushions on it the settees are a shelf that happens to be seat height,
and the forepeak berth is a moulded ledge. Three of the boat's five berths are in
here, and none of them looks like a berth until there is something on it.

Everything is cut to the hull by asking `interior.hull_inner_function`, the same
call the joinery uses, so a cushion cannot end up wider than the boat -- which is
what the clearance check in `verify.py` exists to catch and what it caught the
first time the galley was built.
"""

from math import hypot

import interior
import params
from lib.mesh import cap_loop, grid_to_mesh, join, recalc_normals, shade_smooth


def build(collection):
    """Build the fit-out. Returns a dict of named objects."""
    inner = interior.hull_inner_function()

    return {
        "shelf": _build_shelf(collection, inner),
        "backrests": _build_backrests(collection, inner),
        "cushions": _build_cushions(collection, inner),
        "locker_doors": _build_locker_doors(collection, inner),
        "galley_fittings": _build_galley_fittings(collection, inner),
    }


# --------------------------------------------------------------------------
# Shared construction
# --------------------------------------------------------------------------


SALOON_END = params.SETTEE_END
"""Where everything in the saloon stops aft: the after end of the settees. The
galley is abaft that to port and the quarter berth to starboard, and neither
wants a shelf or a backrest over it."""


def _y(station):
    return params.station_to_y(station)


def _lerp(a, b, t):
    return a + (b - a) * t


def _stations(start, end, count):
    step = (end - start) / (count - 1)
    return [start + step * i for i in range(count)]


def _finish(obj, sharp=35.0):
    recalc_normals(obj)
    shade_smooth(obj, sharp_above_degrees=sharp)
    return obj


def _box(name, collection, station_a, station_b, x0, x1, z0, z1, sharp=30.0):
    """An axis-aligned box, given as two stations, two signed half-offsets and
    two heights."""
    ya, yb = _y(station_a), _y(station_b)
    rings = [
        [(x0, ya, z), (x1, ya, z), (x1, yb, z), (x0, yb, z)] for z in (z1, z0)
    ]

    obj = grid_to_mesh(name, rings, collection, close_rings=True)
    cap_loop(obj, rings[0])
    cap_loop(obj, list(reversed(rings[1])))
    return _finish(obj, sharp)


def _hull_strip(name, collection, inner, side, start, end, z0, z1, thickness,
                count=14, sharp=45.0):
    """A strip lying against the topsides: its outboard face on the hull, its
    inboard face `thickness` in from it, running between two stations.

    The one shape this module needs over and over. A shelf is a short one lying
    flat, a backrest is a tall one standing up, and both of them curve in plan
    because the hull does -- which is the whole reason neither can be a box. At
    the after end of the saloon the hull is 90 mm further outboard than at the
    forward end, and a straight strip either stands clear of the topsides at one
    end or goes through them at the other.

    Cut to the hull at both of its own edges, not at one height for the whole
    strip. The topsides tuck in as they go down -- 43 mm over the 75 mm of a
    settee cushion, amidships -- so a strip given one half-width stands outside
    the boat along one edge and clear of it along the other. Taken at each edge
    it lies against the hull the way a cushion does, and the outboard face picks
    up the tuck.
    """
    rings = []
    for station in _stations(start, end, count):
        top = inner(station, z1)
        foot = inner(station, z0)
        y = _y(station)
        rings.append(
            [
                (side * top, y, z1),
                (side * (top - thickness), y, z1),
                (side * (foot - thickness), y, z0),
                (side * foot, y, z0),
            ]
        )

    obj = grid_to_mesh(name, rings, collection, close_rings=True)
    cap_loop(obj, rings[0])
    cap_loop(obj, list(reversed(rings[-1])))
    return _finish(obj, sharp)


# --------------------------------------------------------------------------
# The shelf and the backrests
# --------------------------------------------------------------------------


def _build_shelf(collection, inner):
    """The shelf under the windows, both sides, stopping at the bulkheads.

    "Eller titta ovanfor ryggstoden till kojerna. Dar loper en hylla som ar
    idealisk for smasaker" -- above the backrests runs a shelf, ideal for small
    things. It is the one piece of joinery the brochure bothers to point at, and
    it does a job no photograph of it explains: it is the horizontal line that
    stops the topsides reading as one blank curve from seat to deckhead.
    """
    return join(
        [
            _hull_strip(
                f"shelf_{side}",
                collection,
                inner,
                side,
                params.BULKHEAD_AFT + 0.020,
                SALOON_END,
                params.SHELF_LEVEL,
                params.SHELF_LEVEL + params.SHELF_THICKNESS,
                params.SHELF_DEPTH,
                sharp=25.0,
            )
            for side in (-1, 1)
        ],
        "shelf",
    )


def _build_backrests(collection, inner):
    """The cushioned bumpers under the shelf, and the one round the forepeak.

    Hung off the underside of the shelf rather than given a height of their own,
    so the two cannot part company -- and so the run of them reads as one
    assembly, which on the boat it is: the shelf's front edge is what holds the
    top of the cushion in.
    """
    top = params.SHELF_LEVEL
    pieces = [
        _hull_strip(
            f"backrest_{side}",
            collection,
            inner,
            side,
            params.BULKHEAD_AFT + 0.020,
            SALOON_END,
            top - params.BACKREST_HEIGHT,
            top,
            params.BACKREST_THICKNESS,
            sharp=50.0,
        )
        for side in (-1, 1)
    ]
    pieces.append(_build_forepeak_bumper(collection, inner))

    return join(pieces, "backrests")


def _build_forepeak_bumper(collection, inner):
    """A bumper wrapping the topsides above the V-berth, port side round to
    starboard.

    Nobody sits up against this one. It is there because two people sleeping
    head-forward in a bow spend the night with their shoulders on the topsides,
    and because it is the only line in the forepeak that is not a berth flat or
    a hull.

    Built as one continuous strip round the bow rather than as two, which means
    it cannot be `_hull_strip`: that walks stations and the nose of this runs
    across them. The section is carried on the *inward normal of its own plan*
    instead, so it stays the same thickness all the way round the turn.
    """
    z0 = interior.floor_level(params.FOREPEAK_BERTH_START)
    z0 += params.CUSHION_THICKNESS + params.FOREPEAK_BUMPER_ABOVE
    z1 = z0 + params.FOREPEAK_BUMPER_HEIGHT

    # Down one side, as far forward as there is 90 mm of hull to fasten to. The
    # plan is taken at the bumper's *foot*, which is the narrowest the hull gets
    # over its height, so nothing along its lower edge can stand outside the boat.
    plan = []
    for station in _stations(params.BULKHEAD_FWD, 0.500, 16):
        half = inner(station, z0)
        if half < 0.090:
            break
        plan.append((station, half))

    if len(plan) < 3:
        return None

    # Round the nose, and back down the other side.
    nose_station, nose_half = plan[-1]
    plan.extend(
        (nose_station - nose_half * (i / 4) ** 0.7, nose_half * (1 - i / 4))
        for i in range(1, 4)
    )
    plan.append((nose_station - nose_half, 0.0))
    plan.extend([(s, -h) for (s, h) in reversed(plan[:-1])])

    thickness = params.BACKREST_THICKNESS

    rings = []
    for i, (station, half) in enumerate(plan):
        ahead = plan[min(i + 1, len(plan) - 1)]
        behind = plan[max(i - 1, 0)]

        # Inward normal of the plan curve, in the (station, x) plane.
        ds, dx = ahead[0] - behind[0], ahead[1] - behind[1]
        length = hypot(ds, dx) or 1.0
        nx, ns = -ds / length, dx / length
        if half * nx > 0:
            nx, ns = -nx, -ns

        y, y_in = _y(station), _y(station + ns * thickness)
        x_in = half + nx * thickness

        rings.append(
            [
                (half, y, z1),
                (x_in, y_in, z1),
                (x_in, y_in, z0),
                (half, y, z0),
            ]
        )

    obj = grid_to_mesh("backrest_forepeak", rings, collection, close_rings=True)
    cap_loop(obj, rings[0])
    cap_loop(obj, list(reversed(rings[-1])))
    return _finish(obj, sharp=50.0)


# --------------------------------------------------------------------------
# Cushions
# --------------------------------------------------------------------------


def _build_cushions(collection, inner):
    """Settee cushions both sides, and the V-berth infill forward.

    Laid on `interior.seat_level`, which is the liner's own seat height, rather
    than on `SETTEE_LEVEL` -- the two agree over the saloon and part company
    across the bulkheads, where the settee fairs into the forepeak berth flat and
    the liner is doing something a single number cannot describe.
    """
    pieces = []

    # The saloon. Port stops at the galley, starboard runs the settee's length;
    # the quarter berth carries on aft of that with its own top and does not want
    # a cushion laid across the join.
    for side, end in ((-1, params.GALLEY_START), (1, SALOON_END)):
        pieces.append(
            _build_flat_cushion(
                f"cushion_{side}",
                collection,
                inner,
                side,
                params.BULKHEAD_AFT + 0.020,
                end - 0.020,
                inboard=lambda s: params.SOLE_HALF_WIDTH + 0.012,
            )
        )

    pieces.append(_build_forepeak_cushion(collection, inner))
    return join([p for p in pieces if p is not None], "cushions")


def _build_flat_cushion(name, collection, inner, side, start, end, inboard):
    """A cushion lying on the liner's seat, cut to the hull at every station."""
    thickness = params.CUSHION_THICKNESS
    rings = []

    for station in _stations(start, end, 10):
        base = interior.seat_level(station)
        top = base + thickness
        # Cut to the hull at both edges. At one height for the whole cushion it
        # stood 33 mm outside the topsides along its lower edge, which read from
        # outside the boat as a tan stripe down the middle of the hull.
        out_top = inner(station, top) - 0.010
        out_foot = inner(station, base) - 0.010
        x_in = inboard(station)
        if min(out_top, out_foot) <= x_in:
            continue

        y = _y(station)
        rings.append(
            [
                (side * x_in, y, top),
                (side * out_top, y, top),
                (side * out_foot, y, base),
                (side * x_in, y, base),
            ]
        )

    if len(rings) < 2:
        return None

    obj = grid_to_mesh(name, rings, collection, close_rings=True)
    cap_loop(obj, rings[0])
    cap_loop(obj, list(reversed(rings[-1])))
    return _finish(obj, sharp=50.0)


def _build_forepeak_cushion(collection, inner):
    """The V-berth mattress: one piece across the centreline, triangular.

    Triangular because the boat is. Its shape is not drawn -- it is the hull's
    own half-width at berth height, station by station, from where the forepeak
    is wide enough to lie in back to the bulkhead. The infill between the two
    arms of the V is part of the same cushion here, which is what an owner ends
    up with anyway once the filler is cut.
    """
    thickness = params.CUSHION_THICKNESS
    rings = []

    for station in _stations(
        params.FOREPEAK_BERTH_START, params.FOREPEAK_BERTH_END - 0.020, 12
    ):
        base = interior.floor_level(station)
        top = base + thickness
        half_top = inner(station, top) - 0.012
        half_foot = inner(station, base) - 0.012
        if min(half_top, half_foot) <= 0.0:
            continue

        y = _y(station)
        rings.append(
            [
                (-half_top, y, top),
                (half_top, y, top),
                (half_foot, y, base),
                (-half_foot, y, base),
            ]
        )

    if len(rings) < 2:
        return None

    obj = grid_to_mesh("cushion_forepeak", rings, collection, close_rings=True)
    cap_loop(obj, rings[0])
    cap_loop(obj, list(reversed(rings[-1])))
    return _finish(obj, sharp=50.0)


# --------------------------------------------------------------------------
# Locker doors
# --------------------------------------------------------------------------


def _build_locker_doors(collection, inner):
    """Doors on the wardrobe and the clothes locker, in the after bulkhead.

    The compartment between the two main bulkheads *is* those two lockers -- see
    the module docstring in joinery.py -- so the doors are the only part of them
    that has to be built, and they are the only part anybody sees. They hang on
    the saloon side of the after bulkhead, either side of the way through to the
    forepeak.
    """
    ceiling = interior.deckhead_function()
    station = params.BULKHEAD_AFT + 0.018

    doors = []
    for side in (-1, 1):
        x_in = params.LOCKER_DOORWAY_HALF_WIDTH + 0.015
        x_out = min(
            x_in + params.LOCKER_DOOR_WIDTH,
            inner(station, params.SETTEE_LEVEL) - 0.020,
        )
        if x_out <= x_in:
            continue

        # Head follows the deckhead, which falls away outboard: a door cut square
        # to the centreline height stands through the ceiling at its far corner.
        head = min(ceiling(station, x_in), ceiling(station, x_out)) - 0.035

        doors.append(
            _box(
                f"locker_door_{side}",
                collection,
                station,
                station + params.LOCKER_DOOR_THICKNESS,
                side * x_in,
                side * x_out,
                params.SETTEE_LEVEL + 0.040,
                head,
                sharp=25.0,
            )
        )

    return join(doors, "locker_doors")


# --------------------------------------------------------------------------
# The pentry
# --------------------------------------------------------------------------


def _build_galley_fittings(collection, inner):
    """Sink and cooker, immediately to port as you come below.

    Both stand proud of the worktop instead of being let into it. The galley is a
    lofted solid with no hole in it, so a recess cut into its top renders nothing
    at all -- the same problem the anchor box had, and the same answer: stand the
    thing a few millimetres proud and let it cast its own line.

    The sink gets away with it because of the tap. A 26 mm dish is not a sink and
    nobody would read it as one, but 160 mm of chrome standing over a shallow
    dish is unmistakable, because nothing else on a boat looks like that.
    """
    top = params.GALLEY_TOP
    out = inner(params.GALLEY_START, top)
    centre = -(out - params.GALLEY_DEPTH / 2)

    sink_length, sink_width, sink_depth = params.SINK
    cooker_length, cooker_width = params.COOKER

    pieces = [
        # The dish: a shallow tray standing 6 mm proud, hollow on top.
        _box(
            "sink_rim",
            collection,
            params.SINK_STATION - sink_length / 2,
            params.SINK_STATION + sink_length / 2,
            centre - sink_width / 2,
            centre + sink_width / 2,
            top + 0.006,
            top + 0.006 + sink_depth,
            sharp=25.0,
        ),
        # The tap, which is what actually says sink.
        _box(
            "tap",
            collection,
            params.SINK_STATION - sink_length / 2 + 0.030,
            params.SINK_STATION - sink_length / 2 + 0.056,
            centre - 0.013,
            centre + 0.013,
            top,
            top + 0.160,
            sharp=25.0,
        ),
        _box(
            "tap_spout",
            collection,
            params.SINK_STATION - sink_length / 2 + 0.030,
            params.SINK_STATION + 0.020,
            centre - 0.011,
            centre + 0.011,
            top + 0.140,
            top + 0.160,
            sharp=25.0,
        ),
        # The cooker: a recessed-looking pan with two burners on it.
        _box(
            "cooker_pan",
            collection,
            params.COOKER_STATION - cooker_length / 2,
            params.COOKER_STATION + cooker_length / 2,
            centre - cooker_width / 2,
            centre + cooker_width / 2,
            top + 0.004,
            top + 0.020,
            sharp=25.0,
        ),
    ]

    for offset in (-cooker_length / 5, cooker_length / 5):
        pieces.append(
            _burner(collection, params.COOKER_STATION + offset, centre, top + 0.020)
        )

    return join(pieces, "galley_fittings")


def _burner(collection, station, x, z):
    """One burner: a low ring, twelve-sided."""
    from math import cos, pi, sin

    rings = [
        [
            (
                x + radius * cos(2 * pi * i / 12),
                _y(station) + radius * sin(2 * pi * i / 12),
                height,
            )
            for i in range(12)
        ]
        for (radius, height) in ((0.058, z), (0.058, z + 0.014), (0.040, z + 0.020))
    ]

    obj = grid_to_mesh(f"burner_{station:.2f}", rings, collection, close_rings=True)
    cap_loop(obj, rings[0])
    cap_loop(obj, list(reversed(rings[-1])))
    return _finish(obj, sharp=40.0)

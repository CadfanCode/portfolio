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

from math import cos, hypot, pi, sin

import interior
import params
from lib.mesh import bevel, cap_loop, grid_to_mesh, join, recalc_normals, shade_smooth


def build(collection):
    """Build the fit-out. Returns a dict of named objects."""
    inner = interior.hull_inner_function()

    return {
        "shelf": _build_shelf(collection, inner),
        "backrests": _build_backrests(collection, inner),
        "cushions": _build_cushions(collection, inner),
        "galley_fittings": _build_galley_fittings(collection, inner),
        "books": _build_books(collection, inner),
        "grabrails": _build_grabrails(collection),
        "cabin_lamp": _build_cabin_lamp(collection, inner),
        "bilge_hatch": _build_bilge_hatch(collection),
    }
    # Removed at the owner's request: the cupboard (locker) doors, the window
    # curtains, the companionway washboard, and the fire extinguisher. The
    # builders below are kept -- they are correct and cost nothing unbuilt --
    # so restoring any of them is a one-line entry in the dict above.


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


def _finish(obj, sharp=35.0, bevel_width=0.0025, bevel_segments=1):
    """Shared clean-up for anything built here: normals, then either a bevel or
    a plain smoothing pass.

    Everything below deck gets its arris taken off -- CLAUDE.md and the owner's
    brief both say so -- but a round object (a burner, a tap) is already round
    by construction, and bevelling the facets of its own cylinder would chamfer
    the very edges that are supposed to read as curved. Those pass
    `bevel_width=None` and fall back to the old shade-smooth-only behaviour.

    One segment by default: a single flat chamfer on every edge of a box is
    twelve new faces, and this module builds dozens of small boxes. A rounded,
    two-segment bevel is reserved for the handful of pieces big enough, and
    looked at closely enough, to be worth the extra faces -- the cushions and
    the cushion-like curtain bunch, both explicitly asked for it below.
    """
    recalc_normals(obj)
    if bevel_width:
        bevel(obj, width=bevel_width, segments=bevel_segments)
    else:
        shade_smooth(obj, sharp_above_degrees=sharp)
    return obj


def _box(name, collection, station_a, station_b, x0, x1, z0, z1, sharp=30.0,
         bevel_width=0.0025, bevel_segments=1):
    """An axis-aligned box, given as two stations, two signed half-offsets and
    two heights."""
    ya, yb = _y(station_a), _y(station_b)
    rings = [
        [(x0, ya, z), (x1, ya, z), (x1, yb, z), (x0, yb, z)] for z in (z1, z0)
    ]

    obj = grid_to_mesh(name, rings, collection, close_rings=True)
    cap_loop(obj, rings[0])
    cap_loop(obj, list(reversed(rings[1])))
    return _finish(obj, sharp, bevel_width=bevel_width, bevel_segments=bevel_segments)


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


SHELF_END = {-1: params.GALLEY_START, 1: SALOON_END}
"""Where the shelf and backrest stop, aft, on each side.

Both used to run to `SALOON_END` on both sides, which put the port one over the
galley -- harmless while the worktop stood 260 mm below it, and a collision the
moment the owner's brief raised GALLEY_TOP to the table: the tap alone now
reaches within 90 mm of where that shelf used to sit. Stopping the port run at
the galley is not a workaround for that, though -- a shelf hanging over a
worktop with a tap on it was never right, independent of the tap's height."""


def _build_shelf(collection, inner):
    """The shelf under the windows, both sides, stopping at the bulkheads --
    and now at a fiddle rail along its inner edge, with end cheeks where the
    run stops open.

    "Eller titta ovanfor ryggstoden till kojerna. Dar loper en hylla som ar
    idealisk for smasaker" -- above the backrests runs a shelf, ideal for small
    things. It is the one piece of joinery the brochure bothers to point at, and
    it does a job no photograph of it explains: it is the horizontal line that
    stops the topsides reading as one blank curve from seat to deckhead.

    A shelf with nothing along its edge is not what that sentence describes,
    though -- "smasaker" stays on a shelf underway because something stops it
    sliding off, and the edge that needs stopping is the inner one: the shelf's
    outer edge is the hull itself, and nothing has ever fallen off a boat
    through its own topsides.
    """
    return join(
        [
            _shelf_with_fiddle(
                f"shelf_{side}",
                collection,
                inner,
                side,
                params.BULKHEAD_AFT + 0.020,
                SHELF_END[side],
            )
            for side in (-1, 1)
        ],
        "shelf",
    )


def _shelf_with_fiddle(name, collection, inner, side, start, end, count=28):
    """The shelf and its fiddle rail, lofted as one profile.

    Not a shelf with a rail glued on: the fiddle's own outer face is the shelf
    top's own inner edge, so the two cannot come loose from each other, and the
    strip's own `cap_loop` ends -- the same close every strip in this module
    gets -- become the end cheeks the shelf is supposed to have, full height
    from the shelf's underside to the top of the fiddle, rather than the 14 mm
    edge a plain shelf would leave.
    """
    depth = params.SHELF_DEPTH
    z0 = params.SHELF_LEVEL
    z1 = z0 + params.SHELF_THICKNESS
    ft = params.FIDDLE_THICKNESS

    stations = _stations(start, end, count)
    length = end - start
    waves = max(2, round(length / 0.28))

    rings = []
    for i, station in enumerate(stations):
        top = inner(station, z1)
        foot = inner(station, z0)
        scallop = params.FIDDLE_SCALLOP * sin(2 * pi * waves * i / (count - 1))
        fiddle_top = z1 + params.FIDDLE_HEIGHT + scallop

        # Out along the shelf top from the hull, up the fiddle's outer face,
        # across its scalloped top, down its inner face flush with the shelf
        # surface, then down the shelf's own thickness and back out along its
        # foot to the hull -- the shelf and the fiddle in one closed loop.
        ring = [
            (top, z1),
            (top - depth + ft, z1),
            (top - depth + ft, fiddle_top),
            (top - depth, fiddle_top),
            (top - depth, z1),
            (foot - depth, z0),
            (foot, z0),
        ]
        y = _y(station)
        rings.append([(side * x, y, z) for (x, z) in ring])

    obj = grid_to_mesh(name, rings, collection, close_rings=True)
    cap_loop(obj, rings[0])
    cap_loop(obj, list(reversed(rings[-1])))
    return _finish(obj, sharp=22.0, bevel_width=0.0015, bevel_segments=1)


def _build_backrests(collection, inner):
    """The cushioned bumpers under the shelf, and the one round the forepeak.

    Hung off the underside of the shelf rather than given a height of their own,
    so the two cannot part company -- and so the run of them reads as one
    assembly, which on the boat it is: the shelf's front edge is what holds the
    top of the cushion in. Stops at the same station the shelf above it now
    does on each side, for the same reason.
    """
    top = params.SHELF_LEVEL
    pieces = [
        _hull_strip(
            f"backrest_{side}",
            collection,
            inner,
            side,
            params.BULKHEAD_AFT + 0.020,
            SHELF_END[side],
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
    """A cushion lying on the liner's seat, cut to the hull at every station.

    Given a slight crown rather than a flat top: a ridge running down the
    middle of the cushion, low enough to be a fill of foam under fabric rather
    than a fold in it. Cheap in geometry -- one extra vertex per ring -- and it
    is most of the difference between a cushion and a slab the same colour as
    one; a flat top is where "plastic shell with furniture in it" comes from.
    """
    thickness = params.CUSHION_THICKNESS
    crown = 0.012
    rings = []

    for station in _stations(start, end, 14):
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

        mid = (x_in + out_top) / 2
        y = _y(station)
        ring = [
            (x_in, base),
            (x_in, top),
            (mid, top + crown),
            (out_top, top),
            (out_foot, base),
        ]
        rings.append([(side * x, y, z) for (x, z) in ring])

    if len(rings) < 2:
        return None

    obj = grid_to_mesh(name, rings, collection, close_rings=True)
    cap_loop(obj, rings[0])
    cap_loop(obj, list(reversed(rings[-1])))
    return _finish(obj, sharp=45.0, bevel_width=0.002, bevel_segments=2)


def _build_forepeak_cushion(collection, inner):
    """The V-berth mattress: one piece across the centreline, triangular.

    Triangular because the boat is. Its shape is not drawn -- it is the hull's
    own half-width at berth height, station by station, from where the forepeak
    is wide enough to lie in back to the bulkhead. The infill between the two
    arms of the V is part of the same cushion here, which is what an owner ends
    up with anyway once the filler is cut.
    """
    thickness = params.CUSHION_THICKNESS
    crown = 0.012
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
                (0.0, y, top + crown),
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
    return _finish(obj, sharp=45.0, bevel_width=0.002, bevel_segments=2)


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

    Each gets two hinge leaves at the edge away from the doorway and a finger
    pull at the edge beside it -- a boat pulls a locker door open by a finger
    hole let into it, not a handle standing proud, because a proud handle in a
    passage this narrow catches a shoulder. The wardrobe's door -- see
    `params.WARDROBE_SIDE` -- is louvred as well, which is the one thing that
    tells it apart from the clothes locker beside it: a hanging locker needs to
    breathe and a shelf locker does not.
    """
    ceiling = interior.deckhead_function()
    station = params.BULKHEAD_AFT + 0.018
    face = station + params.LOCKER_DOOR_THICKNESS

    pieces = []
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
        foot = params.SETTEE_LEVEL + 0.040

        pieces.append(
            _box(
                f"locker_door_{side}",
                collection,
                station,
                face,
                side * x_in,
                side * x_out,
                foot,
                head,
                sharp=25.0,
            )
        )

        hinge_x = side * (x_out - 0.022)
        for hz in (foot + 0.055, head - 0.055):
            pieces.append(
                _box(
                    f"locker_hinge_{side}_{hz:.2f}",
                    collection,
                    face,
                    face + 0.005,
                    hinge_x - 0.017,
                    hinge_x + 0.017,
                    hz - 0.011,
                    hz + 0.011,
                    sharp=20.0,
                )
            )

        pull_x = side * (x_in + 0.032)
        pull_z = (foot + head) / 2
        pieces.append(
            _box(
                f"locker_pull_{side}",
                collection,
                face,
                face + 0.009,
                pull_x - 0.006,
                pull_x + 0.006,
                pull_z - 0.026,
                pull_z + 0.026,
                sharp=20.0,
            )
        )

        if side == params.WARDROBE_SIDE:
            slats = 5
            for i in range(slats):
                z = foot + (head - foot) * (i + 0.5) / slats
                pieces.append(
                    _box(
                        f"locker_louvre_{i}",
                        collection,
                        face,
                        face + 0.005,
                        side * x_in + 0.014,
                        side * x_out - 0.014,
                        z - 0.007,
                        z + 0.007,
                        sharp=15.0,
                    )
                )

    return join(pieces, "locker_doors")


# --------------------------------------------------------------------------
# The pentry
# --------------------------------------------------------------------------


def _oval_ring(station, x, rx, ry, z, count=18):
    """A closed oval ring in the horizontal plane, `count` points round."""
    return [
        (
            x + rx * cos(2 * pi * i / count),
            _y(station) + ry * sin(2 * pi * i / count),
            z,
        )
        for i in range(count)
    ]


def _pipe(name, collection, path, radius, count=8):
    """A round tube swept along a polyline: the one shape a tap needs.

    A circular section carried square to each segment, welded end to end and
    capped. Rough and ready compared with `lib.sweep` -- it mitres nothing at the
    corners -- but a tap's gooseneck turns through gentle angles over a 12 mm
    pipe, where a mitre would never show, and keeping it here avoids the galley
    reaching across two modules for a curve this small.
    """
    from math import atan2

    rings = []
    for i, (px, py, pz) in enumerate(path):
        nxt = path[min(i + 1, len(path) - 1)]
        prv = path[max(i - 1, 0)]
        dx, dy, dz = (nxt[0] - prv[0], nxt[1] - prv[1], nxt[2] - prv[2])
        length = hypot(hypot(dx, dy), dz) or 1.0
        dx, dy, dz = dx / length, dy / length, dz / length
        # Two unit vectors across the pipe, both perpendicular to its direction.
        yaw = atan2(dy, dx)
        side = (-sin(yaw), cos(yaw), 0.0)
        up = (
            dy * side[2] - dz * side[1],
            dz * side[0] - dx * side[2],
            dx * side[1] - dy * side[0],
        )
        ring = []
        for k in range(count):
            a = 2 * pi * k / count
            c, s = cos(a) * radius, sin(a) * radius
            ring.append(
                (px + side[0] * c + up[0] * s,
                 py + side[1] * c + up[1] * s,
                 pz + side[2] * c + up[2] * s)
            )
        rings.append(ring)

    obj = grid_to_mesh(name, rings, collection, close_rings=True)
    cap_loop(obj, rings[0])
    cap_loop(obj, list(reversed(rings[-1])))
    return _finish(obj, sharp=50.0, bevel_width=None)


def _build_galley_fittings(collection, inner):
    """Sink and cooker, immediately to port as you come below -- the closest the
    camera comes to any joinery on the boat, which is why neither is a box.

    Both stand proud of the worktop rather than being let into it. The worktop is
    a lofted solid with no hole in it, so a recess cut into its top renders
    nothing at all -- the same problem the anchor box had, and the same answer:
    stand the thing a few millimetres proud with a hollow of its own, and let it
    cast its own line. A bowl built this way reads as inset from any angle a
    person in the cabin actually has on it.
    """
    top = params.GALLEY_TOP
    out = inner(params.GALLEY_START, top)
    centre = -(out - params.GALLEY_DEPTH / 2)

    sink_length, sink_width, _ = params.SINK
    cooker_length, cooker_width = params.COOKER

    pieces = []
    pieces += _sink(collection, params.SINK_STATION, centre, top, sink_length, sink_width)
    pieces += _cooker(
        collection, params.COOKER_STATION, centre, top, cooker_length, cooker_width
    )
    return join(pieces, "galley_fittings")


def _sink(collection, station, x, top, length, width):
    """A round-cornered bowl with a rolled rim, and a gooseneck mixer beside it.

    The bowl is a single loft: a rim standing 8 mm proud of the worktop, a flat
    lip turned in from it, then the basin dropping away inside to a small flat
    bottom below worktop level. Nothing under the rim shows -- the worktop solid
    is behind it -- so the loft need only be honest from the lip inwards, which
    is all anyone looking down into a sink can see.
    """
    rx, ry = length / 2, width / 2
    lip = 0.014
    rim_z = top + 0.008

    rings = [
        _oval_ring(station, x, rx, ry, top),            # skirt foot, at worktop
        _oval_ring(station, x, rx, ry, rim_z),          # rim, proud
        _oval_ring(station, x, rx - lip, ry - lip, rim_z),      # flat lip, turned in
        _oval_ring(station, x, rx - lip - 0.006, ry - lip - 0.006, top - 0.004),
        _oval_ring(station, x, (rx - lip) * 0.62, (ry - lip) * 0.62, top - 0.046),
        _oval_ring(station, x, (rx - lip) * 0.34, (ry - lip) * 0.34, top - 0.062),
    ]
    bowl = grid_to_mesh("sink_bowl", rings, collection, close_rings=True)
    cap_loop(bowl, list(reversed(rings[-1])))
    _finish(bowl, sharp=45.0, bevel_width=None)

    # A single-lever mixer at the outboard back corner of the bowl, where a tap
    # is plumbed through the worktop against the hull rather than out over the
    # basin. The gooseneck rises, turns inboard and arches back over the bowl.
    base = station - length / 2 + 0.045
    back = x - ry + 0.020
    spout_z = top + 0.150
    tap_path = [
        (back, _y(base), top),
        (back, _y(base), top + 0.055),
        (back, _y(base), spout_z),
        (x - ry * 0.35, _y(base), spout_z + 0.010),
        (x, _y(base + 0.010), spout_z - 0.020),
        (x, _y(base + 0.020), spout_z - 0.055),
    ]
    tap = _pipe("tap", collection, tap_path, 0.011, count=8)

    lever = _box(
        "tap_lever",
        collection,
        base - 0.006,
        base + 0.070,
        x - ry + 0.014,
        x - ry + 0.026,
        top + 0.052,
        top + 0.064,
        sharp=25.0,
        bevel_width=0.002,
    )
    return [bowl, tap, lever]


def _cooker(collection, station, x, top, length, width):
    """A gimballed two-burner: a recessed well with pan rails round it, two
    burners with pot-support grates, and control knobs on the face the cook sees.

    The well stands a few millimetres proud for the same reason the sink does. On
    top of it sit the two things that say cooker rather than tray: a raised rail
    round the edge, which on a boat is what stops a pan walking off in a seaway,
    and the crossed grates a pan actually rests on. The knobs go on the inboard
    long side -- the face turned towards someone standing at the worktop -- since
    that is the side a cook reaches, and the only one in shot from the saloon.
    """
    pieces = []
    hl, hw = length / 2, width / 2
    well_z = top + 0.006

    pieces.append(
        _box(
            "cooker_well",
            collection,
            station - hl,
            station + hl,
            x - hw,
            x + hw,
            top + 0.002,
            well_z,
            sharp=25.0,
            bevel_width=0.002,
        )
    )

    # Pan rail: four low fiddles standing round the rim of the well, a finger's
    # width in from its edge.
    inset, rail_h, rail_t = 0.018, 0.026, 0.006
    rail_specs = [
        (station - hl + inset, station - hl + inset + rail_t, x - hw + inset, x + hw - inset),
        (station + hl - inset - rail_t, station + hl - inset, x - hw + inset, x + hw - inset),
        (station - hl + inset, station + hl - inset, x - hw + inset, x - hw + inset + rail_t),
        (station - hl + inset, station + hl - inset, x + hw - inset - rail_t, x + hw - inset),
    ]
    for i, (s0, s1, x0, x1) in enumerate(rail_specs):
        pieces.append(
            _box(
                f"cooker_rail_{i}",
                collection,
                s0, s1, x0, x1,
                well_z,
                well_z + rail_h,
                sharp=25.0,
                bevel_width=0.0018,
            )
        )

    # Two burners along the boat, each with a pair of crossed pot-support bars.
    for offset in (-length / 5, length / 5):
        bs = station + offset
        pieces.append(_burner(collection, bs, x, well_z))
        for grate in (
            (bs - 0.052, bs + 0.052, x - 0.006, x + 0.006),
            (bs - 0.006, bs + 0.006, x - 0.052, x + 0.052),
        ):
            pieces.append(
                _box(
                    f"cooker_grate_{bs:.2f}_{grate[2]:.2f}",
                    collection,
                    *grate,
                    well_z + 0.018,
                    well_z + 0.024,
                    sharp=25.0,
                    bevel_width=None,
                )
            )

    # Control knobs on the inboard face, one per burner, standing off the front
    # of the well towards the cook (inboard is towards the centreline: +x, since
    # the galley is to port).
    for offset in (-length / 5, length / 5):
        pieces.append(_knob(collection, station + offset, x + hw + 0.010, top + 0.030))

    return pieces


def _knob(collection, station, x, z):
    """One control knob: a short round boss on the cooker's face."""
    rings = [
        [
            (x + r, _y(station) + 0.016 * cos(2 * pi * i / 10), z + 0.016 * sin(2 * pi * i / 10))
            for i in range(10)
        ]
        for r in (0.0, 0.022)
    ]
    obj = grid_to_mesh(f"knob_{station:.2f}", rings, collection, close_rings=True)
    cap_loop(obj, list(reversed(rings[-1])))
    return _finish(obj, sharp=40.0, bevel_width=None)


def _burner(collection, station, x, z):
    """One burner: a low ring, twelve-sided."""
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
    # Round already, by construction -- bevelling its own facets would chamfer
    # the curve it is there to fake.
    return _finish(obj, sharp=40.0, bevel_width=None)


# --------------------------------------------------------------------------
# Fine detail -- the things a cabin this size actually has
# --------------------------------------------------------------------------
#
# Picked for where the camera stands rather than for completeness: the saloon
# stop looks forward at the bulkhead and the doorway through it, the galley
# stop looks across at the window, and both are close enough below deck that
# nothing here has to be large to be seen. A Maxi 77 is a small, plain,
# well-made Swedish boat, so this stops well short of everything a cabin could
# have -- see `blender/_handoff_interior.md` for what was left out and why.


def _build_books(collection, inner):
    """A few books on the shelf, propped against the fiddle.

    Not a shelf's worth, and only over one settee: a full run of books both
    sides is more library than a 7.6 m cruiser carries, and the shelf exists to
    be "ideal for smasaker" generally, not to be a bookcase. This is the one
    thing on it substantial enough to need the fiddle at all.
    """
    sizes = ((0.185, 0.026), (0.205, 0.021), (0.165, 0.031), (0.195, 0.023))
    side = 1  # starboard, over the settee that runs the shelf's full length
    z0 = params.SHELF_LEVEL + params.SHELF_THICKNESS

    books = []
    station = (params.BULKHEAD_AFT + SALOON_END) / 2 - 0.10
    for i, (height, spine) in enumerate(sizes):
        out = inner(station, z0)
        x_in = out - params.SHELF_DEPTH + params.FIDDLE_THICKNESS + 0.008
        x_out = min(x_in + 0.105, out - 0.015)
        if x_out <= x_in:
            continue
        books.append(
            _box(
                f"book_{i}",
                collection,
                station,
                station + spine,
                side * x_in,
                side * x_out,
                z0,
                z0 + height,
                sharp=15.0,
                bevel_width=0.0015,
            )
        )
        station += spine + 0.006

    return join(books, "books")


def _build_grabrails(collection):
    """Twin handrails on the deckhead, flanking the mast post over the table.

    A post on the centreline already gives a hand something to find there; the
    rails are for the rest of the walk between the doorway and the table, which
    on a boat that heels is exactly the reach a single centreline post cannot
    cover.
    """
    ceiling = interior.deckhead_function()
    start, end = params.BULKHEAD_AFT + 0.120, SALOON_END - 0.120
    offset = 0.150
    drop = 0.026
    radius = 0.011
    segments = 8

    pieces = []
    for side in (-1, 1):
        rings = []
        for station in _stations(start, end, 10):
            z = ceiling(station, offset) - drop
            y = _y(station)
            rings.append(
                [
                    (
                        side * offset + radius * cos(2 * pi * i / segments),
                        y,
                        z + radius * sin(2 * pi * i / segments),
                    )
                    for i in range(segments)
                ]
            )
        obj = grid_to_mesh(f"grabrail_{side}", rings, collection, close_rings=True)
        cap_loop(obj, rings[0])
        cap_loop(obj, list(reversed(rings[-1])))
        pieces.append(_finish(obj, bevel_width=None))

    return join(pieces, "grabrails")


def _build_curtains(collection, inner):
    """A curtain track at each saloon window, with the curtain itself gathered
    to the after end rather than drawn across.

    The two long saloon windows are otherwise the largest bare surface in the
    cabin, and the brochure's own photographs of boats this size that have them
    fitted keep them open -- a boat lying at anchor with the curtains drawn
    reads as shut up rather than lived in.
    """
    import deck

    sheer = interior.sheer_z
    pieces = []

    for w_index, (fwd, aft) in enumerate(params.WINDOWS):
        mid = (fwd + aft) / 2
        top = sheer(mid) - params.WINDOW_MARGIN_TOP
        bottom = sheer(mid) - deck.band_height(mid) + params.WINDOW_MARGIN_BOTTOM
        if bottom >= top - 0.030:
            continue

        for side in (-1, 1):
            out = inner(mid, top)
            x_in = out - 0.020
            x_out = x_in - 0.010

            pieces.append(
                _box(
                    f"curtain_track_{w_index}_{side}",
                    collection,
                    fwd + 0.015,
                    aft - 0.015,
                    side * x_in,
                    side * x_out,
                    top - 0.006,
                    top,
                    sharp=25.0,
                )
            )

            # Gathered to the after end -- an open curtain is a bunch, not a
            # straight edge.
            pieces.append(
                _box(
                    f"curtain_{w_index}_{side}",
                    collection,
                    aft - 0.150,
                    aft - 0.020,
                    side * x_in,
                    side * (x_in - 0.026),
                    bottom,
                    top - 0.015,
                    sharp=20.0,
                    bevel_width=0.003,
                    bevel_segments=2,
                )
            )

    return join(pieces, "curtains")


def _build_cabin_lamp(collection, inner):
    """A single cabin lamp on the deckhead, centreline, over the saloon table.

    The brochure counts three, "varav en i forpiken" -- one of which is in the
    forepeak -- but this is the one the saloon camera stop actually looks up
    at, and one fixture says lamp as clearly as three would.
    """
    ceiling = interior.deckhead_function()
    station = (params.BULKHEAD_AFT + SALOON_END) / 2
    z = ceiling(station, 0.0) - 0.004
    y = _y(station)
    segments = 10

    def ring(radius, dz):
        return [
            (
                radius * cos(2 * pi * i / segments),
                y + radius * sin(2 * pi * i / segments),
                z - dz,
            )
            for i in range(segments)
        ]

    rings = [ring(0.022, 0.0), ring(0.022, 0.012), ring(0.055, 0.014), ring(0.048, 0.045)]
    obj = grid_to_mesh("cabin_lamp", rings, collection, close_rings=True)
    cap_loop(obj, rings[0])
    cap_loop(obj, list(reversed(rings[-1])))
    return _finish(obj, bevel_width=None)


def _build_bilge_hatch(collection):
    """A hatch in the cabin sole, between the table and the galley.

    Bilge access has to be somewhere along the keel, and this is the one
    stretch of saloon walkway not already claimed by the table, the steps or a
    berth. Proud of the sole rather than let into it, for the same reason the
    anchor box's lid is: the liner is a single lofted surface with no hole in
    it, so a recess cut into its top renders nothing at all. The fiddle round
    its own edge and the pull are what read as a hatch instead of a smear.
    """
    start, end = 4.300, 4.600
    half = params.SOLE_HALF_WIDTH - 0.030
    z = params.SOLE_LEVEL
    proud = 0.004
    rim = 0.016

    pieces = [
        _box(
            "bilge_hatch_panel", collection, start, end, -half, half, z, z + proud,
            sharp=20.0,
        ),
    ]
    for s0, s1, x0, x1 in (
        (start, start + rim, -half, half),
        (end - rim, end, -half, half),
        (start + rim, end - rim, -half, -half + rim),
        (start + rim, end - rim, half - rim, half),
    ):
        pieces.append(
            _box(
                f"bilge_hatch_fiddle_{s0:.3f}_{x0:.3f}",
                collection, s0, s1, x0, x1, z + proud, z + proud + 0.006,
                sharp=20.0,
            )
        )

    mid = (start + end) / 2
    pieces.append(
        _box(
            "bilge_hatch_pull", collection, mid - 0.028, mid + 0.028, -0.017, 0.017,
            z + proud, z + proud + 0.007, sharp=20.0,
        )
    )

    return join(pieces, "bilge_hatch")


def _build_washboard(collection):
    """The lower washboard, in place across the foot of the companionway.

    A real one lifts out; this one does not need to, because nobody in the
    scene is going anywhere -- and an empty doorway reads as a hole through to
    the cockpit rather than as the way the crew actually come and go. Built on
    the same lean the doorway itself is cut on (`deck.companionway_lean`), so
    it sits in the opening rather than standing square across a face that does
    not.
    """
    import deck

    half, sill, head = deck.companionway_opening()
    height = min(0.320, (head - sill) * 0.6)
    station = params.COACHROOF_END
    thickness = 0.018
    half_board = half - 0.012

    def y_at(z):
        return params.station_to_y(station) + deck.companionway_lean(station, z)

    rings = []
    for z in (sill + height, sill):
        yc = y_at(z)
        rings.append(
            [
                (-half_board, yc - thickness / 2, z),
                (half_board, yc - thickness / 2, z),
                (half_board, yc + thickness / 2, z),
                (-half_board, yc + thickness / 2, z),
            ]
        )

    obj = grid_to_mesh("washboard", rings, collection, close_rings=True)
    cap_loop(obj, rings[0])
    cap_loop(obj, list(reversed(rings[1])))
    return _finish(obj, sharp=25.0)


def _build_fire_extinguisher(collection, inner):
    """A small extinguisher strapped to the aft bulkhead, within reach of both
    the galley and the steps -- which is where the regulations that do not
    otherwise touch this model would put one.
    """
    station = params.BULKHEAD_AFT + 0.026
    x = params.LOCKER_DOORWAY_HALF_WIDTH + 0.065
    z0 = interior.floor_level(station) + 0.220
    radius = 0.038
    height = 0.260
    y = _y(station)
    segments = 10

    def ring(r, z):
        return [
            (x + r * cos(2 * pi * i / segments), y + r * sin(2 * pi * i / segments), z)
            for i in range(segments)
        ]

    rings = [
        ring(radius, z0),
        ring(radius, z0 + height),
        ring(radius * 0.6, z0 + height + 0.030),
    ]
    obj = grid_to_mesh("fire_extinguisher", rings, collection, close_rings=True)
    cap_loop(obj, rings[0])
    cap_loop(obj, list(reversed(rings[-1])))
    return _finish(obj, bevel_width=None)

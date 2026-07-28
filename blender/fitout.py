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

    parts = {
        "shelf": _build_shelf(collection, inner),
        "backrests": _build_backrests(collection, inner),
        "cushions": _build_cushions(collection, inner),
        "grabrails": _build_grabrails(collection),
        "cabin_lamp": _build_cabin_lamp(collection, inner),
        "bilge_hatch": _build_bilge_hatch(collection),
    }
    # Four builders return several objects each rather than one, for the same
    # reason `_build_instruments` does: a thing made of more than one material
    # has to be more than one object, because glTF gives a mesh one material.
    # A book is cloth and paper and gilt; a lamp is brass and enamel and the
    # light inside it.
    parts.update(_build_instruments(collection))
    parts.update(_build_books(collection, inner))
    parts.update(_build_pillows(collection, inner))
    parts.update(_build_desk_fittings(collection, inner))
    parts.update(_build_vhf(collection))
    return parts
    # Removed at the owner's request: the cupboard (locker) doors, the window
    # curtains, the companionway washboard, the fire extinguisher, and the sink
    # and cooker (the worktop is the chart table now -- see
    # `_build_desk_fittings`). The builders below are kept -- they are correct
    # and cost nothing unbuilt -- so restoring any of them is a one-line entry
    # in the dict above.


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
# Pillows
# --------------------------------------------------------------------------
#
# Six scatter cushions: two on each settee and a pair at the head of the
# V-berth. Owner's brief, and the reason for it is the same one the settee
# cushions themselves answer, one step further on. A cushion is what stops the
# liner reading as a moulding; a pillow left on the cushion is what stops the
# *cabin* reading as an empty one. Nothing in the boat is out of place until
# something is, and a scatter cushion is the cheapest thing in the world that
# somebody has plainly moved.


# (side, station, fabric) -- fabric 0 is the striped cloth, 1 the plain.
# Alternated along each run so no two neighbours match, which is how a pair of
# them on a settee reads as two cushions rather than as one modelled twice.
_SALOON_PILLOWS = (
    (1, 3.560, 0),
    (1, 4.200, 1),
    (-1, 3.480, 1),
    (-1, 4.060, 0),
)

_FOREPEAK_PILLOWS = (
    (-1, 1.300, 0),
    (1, 1.300, 1),
)


def _build_pillows(collection, inner):
    """Scatter cushions on the settees and in the forepeak.

    Two objects for the two fabrics, plus one for the piping, which every one of
    them shares -- see `build` for why a thing made of several materials has to
    be several objects.
    """
    fabrics = {0: [], 1: []}
    piping = []

    for side, station, fabric in _SALOON_PILLOWS:
        body, cord = _settee_pillow(collection, inner, side, station)
        fabrics[fabric].append(body)
        piping.append(cord)

    for side, station, fabric in _FOREPEAK_PILLOWS:
        body, cord = _forepeak_pillow(collection, inner, side, station)
        fabrics[fabric].append(body)
        piping.append(cord)

    return {
        "pillows_stripe": join(fabrics[0], "pillows_stripe"),
        "pillows_plain": join(fabrics[1], "pillows_plain"),
        "pillow_piping": join(piping, "pillow_piping"),
    }


def _settee_pillow(collection, inner, side, station):
    """One pillow on a settee, leaning back against the backrest.

    Everything about where it sits is asked for rather than fitted. The cushion
    it rests on is `interior.seat_level` plus the cushion's own thickness -- the
    same two calls `_build_flat_cushion` used to lay that cushion down -- and
    the backrest it leans on is the hull less `BACKREST_THICKNESS` at the
    pillow's own centre height, so the pair stay together if either moves.

    The one clamp is at the top. There is 275 mm between the settee cushion and
    the underside of the shelf, and a 290 mm pillow tipped back does not fit
    upright in it -- the first pass put two of them through the shelf, which is
    invisible from every interior camera and obvious from the section. So the
    centre is dropped until the highest point of the loft clears the shelf by
    10 mm, and if that means the pillow sits deeper into the cushion than it
    would, that is what a cushion is for.
    """
    lean = 0.44  # radians off vertical: leaning back, not lying down
    half_u, half_v, half_w = params.PILLOW_SIZE

    base = interior.seat_level(station) + params.CUSHION_THICKNESS
    along = (0.0, 1.0, 0.0)
    face = (-side * cos(lean), 0.0, sin(lean))
    up = _cross(face, along)

    # How far the loft reaches above its own centre. Not simply `half_v` -- the
    # plan shrinks as the section swells (see `_pillow`), so the highest point
    # is neither the seam nor the face but somewhere between them, and it is
    # cheaper to find it by walking the same profile the loft uses than to
    # solve for it.
    reach = max(
        abs(up[2]) * half_v * k + abs(face[2]) * half_w * w
        for (k, w) in _PILLOW_PROFILE
    )
    centre_z = min(base + half_v * 0.92, params.SHELF_LEVEL - 0.010 - reach)

    # Backed up against the backrest, which follows the hull.
    back = inner(station, centre_z) - params.BACKREST_THICKNESS
    centre = (side * (back - half_w * 0.85), _y(station), centre_z)

    return _pillow(
        f"pillow_{side}_{station:.2f}", collection, centre, along, face,
        half_u, half_v, half_w,
    )


def _forepeak_pillow(collection, inner, side, station):
    """One pillow at the head of the V-berth, lying nearly flat.

    Nearly flat and not upright, because there is nothing here to lean one
    against: the forepeak bumper is 200 mm above the mattress and wraps the
    topsides, and a pillow propped on it would be a pillow standing in the
    middle of a berth two people sleep in. Laid down and angled outboard along
    the arm of the V, which is where a pillow in a forepeak actually is.
    """
    half_u, half_v, half_w = params.PILLOW_SIZE
    tilt = 0.20

    base = interior.floor_level(station) + params.CUSHION_THICKNESS
    # Along the arm of the V: forward and outboard, following the berth rather
    # than lying square across a boat that has no square left this far forward.
    along = _unit((side * 0.42, 0.91, 0.0))
    face = _unit((-side * sin(tilt) * 0.5, -sin(tilt), cos(tilt)))
    up = _cross(face, along)

    reach = max(
        abs(up[2]) * half_v * k + abs(face[2]) * half_w * w
        for (k, w) in _PILLOW_PROFILE
    )

    # Out from the centreline as far as the forepeak allows. The hull is 4.5 m
    # of boat away from its widest here and closing fast, and a pillow set at a
    # fixed offset went through the topsides at the head of the berth -- so the
    # offset is whatever leaves the pillow's own outboard half inside the hull,
    # or the nominal quarter-metre if the bow is wide enough to spare it.
    half = inner(station, base)
    reach_x = abs(up[0]) * half_v + abs(along[0]) * half_u
    centre = (
        side * min(0.230, max(0.0, half - reach_x - 0.020)),
        _y(station),
        base + reach - 0.012,   # settled 12 mm into the mattress
    )

    return _pillow(
        f"pillow_fwd_{side}", collection, centre, along, face,
        half_u, half_v, half_w,
    )


def _pillow_profile(steps=5, sweep=1.45, flatness=0.32):
    """The pillow's section, as `(plan scale, offset)` pairs from one face round
    the seam to the other.

    A pillow is not an ellipsoid and it is not a rounded box; it is a flat bag
    stuffed until it is not flat. What that produces is a broad, slightly domed
    face on each side, a hard maximum in plan exactly at the seam where the two
    panels are sewn, and a fast turn between them.

    `cos(phi) ** flatness` is that shape in one term. At `flatness = 1` it is a
    circle -- a bolster. Pulling the exponent down towards zero holds the plan
    near its full size for most of the sweep and then drops it quickly at the
    ends, which broadens the faces and tightens the turn: 0.32 is a well-filled
    scatter cushion, and the number is worth stating because it is the only
    thing in this file standing in for a cloth simulation.

    `sweep` stops short of a right angle so the loft ends on a real ring rather
    than on a degenerate point, and `_pillow` caps those two rings -- which is
    also what gives each face its flat middle.
    """
    return [
        (
            cos(sweep * (2 * i / (steps - 1) - 1)) ** flatness,
            sin(sweep * (2 * i / (steps - 1) - 1)),
        )
        for i in range(steps)
    ]


_PILLOW_PROFILE = _pillow_profile()


def _pillow(name, collection, centre, along, face, half_u, half_v, half_w,
            plan_points=16):
    """A plush cushion in an arbitrary plane, with a corded seam round it.

    Built in its own frame -- `along` its long axis, `face` its front normal,
    and their cross product for the third -- so the same call makes a pillow
    leaning against a backrest and one lying flat in the bow, and neither needs
    to know which way the boat is pointing.

    The plan is a superellipse rather than a rounded rectangle, for the same
    reason the section is `cos ** flatness` rather than a fillet: a sewn corner
    on a stuffed cushion is not an arc of a circle joined to two straight lines,
    it is full at the middle of each side and pulled in continuously to the
    corner. One exponent describes that and no amount of filleting does.

    Returns `(body, piping)`. The piping is a small tube run round the seam
    ring -- the widest ring of the loft, where the two panels meet -- closed by
    repeating its first section at the end rather than by capping, so it is a
    real loop with no seam of its own.
    """
    u, v, w = _unit(along), _unit(_cross(face, along)), _unit(face)

    def at(a, b, c):
        return (
            centre[0] + u[0] * a + v[0] * b + w[0] * c,
            centre[1] + u[1] * a + v[1] * b + w[1] * c,
            centre[2] + u[2] * a + v[2] * b + w[2] * c,
        )

    # Superellipse plan, walked once.
    plan = []
    for i in range(plan_points):
        angle = 2 * pi * i / plan_points
        ca, sa = cos(angle), sin(angle)
        plan.append(
            (
                half_u * (1 if ca >= 0 else -1) * abs(ca) ** 0.5,
                half_v * (1 if sa >= 0 else -1) * abs(sa) ** 0.5,
            )
        )

    rings = [
        [at(pu * scale, pv * scale, half_w * offset) for (pu, pv) in plan]
        for (scale, offset) in _PILLOW_PROFILE
    ]
    body = grid_to_mesh(name, rings, collection, close_rings=True)
    cap_loop(body, rings[0])
    cap_loop(body, list(reversed(rings[-1])))
    _finish(body, sharp=60.0, bevel_width=None)

    # The cord, round the widest ring.
    seam = rings[len(rings) // 2]
    radius = params.PILLOW_PIPING
    cord_rings = []
    for i in range(len(seam) + 1):
        point = seam[i % len(seam)]
        ahead = seam[(i + 1) % len(seam)]
        behind = seam[(i - 1) % len(seam)]
        tangent = _unit(tuple(ahead[k] - behind[k] for k in range(3)))
        outward = _unit(_cross(tangent, w))
        cord_rings.append(
            [
                tuple(
                    point[k]
                    + outward[k] * radius * cos(2 * pi * j / 6)
                    + w[k] * radius * sin(2 * pi * j / 6)
                    for k in range(3)
                )
                for j in range(6)
            ]
        )

    cord = grid_to_mesh(f"{name}_piping", cord_rings, collection, close_rings=True)
    _finish(cord, sharp=60.0, bevel_width=None)

    return body, cord


def _cross(a, b):
    return (
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    )


def _unit(v):
    length = (v[0] ** 2 + v[1] ** 2 + v[2] ** 2) ** 0.5 or 1.0
    return (v[0] / length, v[1] / length, v[2] / length)


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


SINK_OPENING = 0.80
"""The bowl's basin opening, as a fraction of the sink's rim half-sizes: the
oval the basin drops through, inside the flange that rests on the worktop."""

SINK_CUT_MARGIN = 0.006
"""How much larger the worktop cut is than the basin opening, each half-axis.

The bowl's flange laps the cut edge by this much rather than landing exactly on
it, so the seam between chrome and teak is covered from above and there is no
knife-edge of two surfaces meeting in the same plane."""


def galley_sink_centre(inner):
    """Athwartships centreline of the sink, shared by the bowl (here) and the
    opening cut for it in the worktop (`joinery`). Single-sourced so the two
    cannot disagree about where the hole is -- the same reasoning `verify.py`
    applies to the three fittings that have to agree with something built
    elsewhere."""
    out = inner(params.GALLEY_START, params.GALLEY_TOP)
    return -(out - params.GALLEY_DEPTH / 2)


def galley_sink_opening(inner):
    """The oval the worktop is cut to over the sink: `(station, x, rx, ry)`.

    Read by `joinery._build_galley`, which cuts the hole, so the cut follows the
    bowl automatically. Slightly larger than the bowl's own basin opening (see
    `SINK_CUT_MARGIN`) so the flange covers the cut."""
    x = galley_sink_centre(inner)
    length, width, _ = params.SINK
    return (
        params.SINK_STATION,
        x,
        (length / 2) * SINK_OPENING + SINK_CUT_MARGIN,
        (width / 2) * SINK_OPENING + SINK_CUT_MARGIN,
    )


def _build_galley_fittings(collection, inner):
    """Sink and cooker, immediately to port as you come below -- the closest the
    camera comes to any joinery on the boat, which is why neither is a box.

    No longer built. Owner's brief: the worktop is a chart table now, and what
    stands on it is in `_build_desk_fittings` below. Kept whole, with `_sink`,
    `_cooker`, `_burner`, `_knob` and `galley_sink_opening` -- they are correct,
    they are the only geometry in this file that a boolean in `joinery` was ever
    written for, and restoring the pentry is one entry in `build`'s dict and
    three lines in `joinery._build_galley`.

    The cooker stands proud of the worktop with a hollow of its own, the way the
    anchor box's lid and the bilge hatch do: the worktop is a lofted solid, and a
    recess merely cut into its top renders nothing. The sink is the one place
    that answer failed. A basin has to drop below the worktop, and the worktop's
    own unbroken top face then stood between the eye and the bowl -- so the sink
    read as a shallow wooden tray inside a chrome rim. It is let in properly now:
    `joinery` cuts the worktop over it (`galley_sink_opening`) and the bowl drops
    through, its flange resting on the teak and covering the cut.
    """
    top = params.GALLEY_TOP
    centre = galley_sink_centre(inner)

    sink_length, sink_width, _ = params.SINK
    cooker_length, cooker_width = params.COOKER

    pieces = []
    pieces += _sink(collection, params.SINK_STATION, centre, top, sink_length, sink_width)
    pieces += _cooker(
        collection, params.COOKER_STATION, centre, top, cooker_length, cooker_width
    )
    return join(pieces, "galley_fittings")


def _sink(collection, station, x, top, length, width):
    """A round-cornered stainless drop-in bowl, and a gooseneck mixer beside it.

    Let into the worktop rather than standing on it. `joinery` cuts an oval
    opening through the worktop over the sink (`galley_sink_opening`) and this
    bowl drops through it: a flange sitting on the teak, turning in to the
    opening, then the basin falling away to a small flat bottom. The flange laps
    the cut edge, so the only teak that shows around the bowl is the worktop the
    flange rests on -- and looking in, the basin is simply there, where before
    the worktop's own top face covered it.
    """
    rx, ry = length / 2, width / 2
    orx, ory = rx * SINK_OPENING, ry * SINK_OPENING   # basin opening / flange inner
    rim_z = top + 0.006

    rings = [
        _oval_ring(station, x, rx, ry, top),           # flange foot, on the worktop
        _oval_ring(station, x, rx, ry, rim_z),         # flange rim, just proud
        _oval_ring(station, x, orx, ory, rim_z),       # flange turned in to the opening
        _oval_ring(station, x, orx, ory, top - 0.004),         # basin shoulder, into the hole
        _oval_ring(station, x, orx * 0.64, ory * 0.64, top - 0.052),
        _oval_ring(station, x, orx * 0.34, ory * 0.34, top - 0.072),
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
# The chart table
# --------------------------------------------------------------------------
#
# The same block of joinery the pentry stood on -- `joinery._build_galley`
# still builds it and `params.GALLEY_*` still place it -- with a lamp, a chart,
# a pipe, two pencils and a safe on it instead of a sink and a hob.
#
# Two of the five are placeholders in the portfolio's sense: the safe becomes
# the authentication exhibit, and the chart is what the radar exhibit will be
# drawn on. The other three are not, and that is the point of them. An exhibit
# standing on a bare worktop is a button on a shelf; the pipe somebody put down
# and the pencils they left on the chart are what make the safe read as a safe
# on a desk rather than as a prop with a hotspot attached to it.


def _ring_across(station, x, z, radius, count=12):
    """A ring in the athwartships/vertical plane at one station: the section of
    anything whose axis runs *fore and aft* -- a pencil, a knob on a panel that
    faces forward.

    The third of the three. `_oval_ring` is the section of anything standing up
    and `_ring_along` below is the section of anything pointing athwartships,
    and between them they cover every round thing below deck. Naming them for
    the axis they are perpendicular to rather than for the plane they lie in is
    deliberate: the axis is what you know when you reach for one of these, and
    the first version of this file had one helper called for the wrong plane,
    which put the safe's combination dial on the side of the safe nobody can
    see and left a brass teardrop on the door.
    """
    return [
        (
            x + radius * cos(2 * pi * i / count),
            _y(station),
            z + radius * sin(2 * pi * i / count),
        )
        for i in range(count)
    ]


def _ring_along(station, x, z, radius, count=12):
    """A ring in the fore-and-aft/vertical plane at one offset: the section of
    anything whose axis runs *athwartships* -- the dial on a safe whose door
    faces across the boat. See `_ring_across`."""
    return [
        (
            x,
            _y(station + radius * cos(2 * pi * i / count)),
            z + radius * sin(2 * pi * i / count),
        )
        for i in range(count)
    ]


def _build_desk_fittings(collection, inner):
    """Everything standing on the chart table.

    Laid out in the worktop's four corners, which is what 640 x 480 mm and five
    objects allows and what a person sitting at the inboard edge of it wants.

    The safe takes the after outboard corner -- the angle between the bulkhead
    and the topsides, the one part of the table nobody reaches across. The lamp
    stands in the forward outboard corner diagonally opposite it, the other spot
    no hand goes, and arches its neck inboard over the middle. The chart lies
    along the inboard half under that reach, with the pipe and the pencils on it.

    Everything inboard of the safe, in other words, and that ordering is the
    whole of the layout: the two objects you are meant to look at are the safe,
    which stands up and is seen against the bulkhead, and the chart, which lies
    flat and is seen under the lamp. Neither has anything in front of it.

    Returns one object per material rather than one per object: brass, enamel,
    the light itself, the chart, the safe's paintwork and its brass, the pipe's
    briar, and one pool of dark matte for the pipe's stem and the pencils'
    points together. See `build`.
    """
    top = params.GALLEY_TOP
    out = inner(params.GALLEY_START, top)
    edge = -(out - params.GALLEY_DEPTH)  # signed: the worktop's inboard edge

    brass, enamel, glow = _desk_lamp(collection)
    chart, chart_top = _desk_chart(collection, edge, top)
    safe_body, safe_brass = _desk_safe(collection, inner, top)
    briar, vulcanite = _desk_pipe(collection, edge, chart_top)
    pencils, points = _desk_pencils(collection, edge, chart_top)

    return {
        "desk_lamp": join(brass, "desk_lamp"),
        "desk_lamp_shade": enamel,
        "desk_lamp_glow": glow,
        "desk_chart": chart,
        "desk_safe": join(safe_body, "desk_safe"),
        "desk_safe_brass": join(safe_brass, "desk_safe_brass"),
        "desk_pipe": briar,
        # The pencil points join the pipe's stem and bit: both are the dark
        # matte the palette already carries, and neither is worth an object of
        # its own for eight millimetres of graphite.
        "desk_pipe_stem": join(vulcanite + points, "desk_pipe_stem"),
        "desk_pencils": join(pencils, "desk_pencils"),
    }


def _desk_lamp(collection):
    """A gooseneck lamp: weighted brass base, an arm that rises and arches back
    over the table, and an enamelled shade hanging off the end of it.

    The one object in the cabin that is a light rather than being lit, and the
    reason it is worth building carefully: `build.py` exports with
    `export_lights=False`, so nothing in this file can put an actual lamp in the
    GLB. What it can do is put a surface in there that *looks* lit -- the
    emissive disc across the shade's mouth, returned separately below -- and let
    the app hang a real point light at the same place (`PortfolioWorld`). The
    two together are what a lamp is: a bright thing you can see, and a pool of
    light under it. Either alone reads as a mistake.

    The arm is `_pipe` along a hand-placed path rather than a curve solved for,
    which is the same call the old galley tap used and for the same reason: it
    turns through gentle angles over a 20 mm tube and a mitre would never show.
    """
    top = params.GALLEY_TOP
    x = params.DESK_LAMP_X
    station = params.DESK_LAMP_STATION
    head = top + params.DESK_LAMP_HEIGHT

    # The base: a shallow drawn dish, wide enough to hold the arm's overhang
    # down, which on a boat that heels is not a detail.
    base_rings = [
        _oval_ring(station, x, 0.054, 0.054, top),
        _oval_ring(station, x, 0.054, 0.054, top + 0.009),
        _oval_ring(station, x, 0.042, 0.042, top + 0.016),
        _oval_ring(station, x, 0.014, 0.014, top + 0.022),
    ]
    base = grid_to_mesh("desk_lamp_base", base_rings, collection, close_rings=True)
    cap_loop(base, base_rings[0])
    cap_loop(base, list(reversed(base_rings[-1])))
    _finish(base, sharp=40.0, bevel_width=None)

    # Up, then inboard and aft over the table. The shade hangs at the end.
    #
    # Where the end lands is set by the safe and not by the lamp. The safe
    # stands 230 mm off the worktop and the shade's rim is 144 mm across, so an
    # arm carried too far aft puts the rim on top of it -- an earlier version
    # cleared the safe's back corner by 4 mm, which from across the cabin reads
    # as the lamp resting on it. With the safe now in the after outboard corner
    # the arm goes the other way: hard inboard and only a little aft, so the
    # shade hangs over the middle of the chart and stays 74 mm forward of the
    # safe. It reaches further across the table than it used to and clears it
    # by more, which is the corner layout paying for itself.
    shade_x = x + 0.170
    shade_station = station + 0.180
    arm = _pipe(
        "desk_lamp_arm",
        collection,
        [
            (x, _y(station), top + 0.018),
            (x, _y(station), top + 0.130),
            (x + 0.008, _y(station + 0.030), top + 0.222),
            (x + 0.048, _y(station + 0.086), head - 0.012),
            (x + 0.112, _y(station + 0.140), head + 0.005),
            (shade_x, _y(shade_station), head - 0.002),
        ],
        0.010,
        count=8,
    )

    # The shade: a plain cone, open at the bottom, hanging under the arm's end.
    mouth = head - 0.076
    shade_rings = [
        _oval_ring(shade_station, shade_x, 0.026, 0.026, head),
        _oval_ring(shade_station, shade_x, 0.030, 0.030, head - 0.010),
        _oval_ring(shade_station, shade_x, 0.072, 0.072, mouth),
        _oval_ring(shade_station, shade_x, 0.070, 0.070, mouth + 0.006),
    ]
    shade = grid_to_mesh("desk_lamp_shade", shade_rings, collection, close_rings=True)
    cap_loop(shade, shade_rings[0])
    _finish(shade, sharp=40.0, bevel_width=None)

    # The light. A disc across the mouth, a few millimetres up inside the shade
    # so the rim shades it from directly across the cabin the way a real one
    # does -- an emissive plane flush with the mouth glares from every angle,
    # which is the giveaway that it is a plane and not a lamp.
    glow_rings = [
        _oval_ring(shade_station, shade_x, 0.062, 0.062, mouth + 0.011),
        _oval_ring(shade_station, shade_x, 0.062, 0.062, mouth + 0.014),
    ]
    glow = grid_to_mesh("desk_lamp_glow", glow_rings, collection, close_rings=True)
    cap_loop(glow, glow_rings[0])
    _finish(glow, sharp=40.0, bevel_width=None)

    return [base, arm], shade, glow


def _desk_chart(collection, edge, top):
    """The chart: a sheet lying on the table, lifted at its edges.

    Returns the object and the height of its own top surface amidships, which
    the pipe and the pencils are then stood on -- they lie on the chart, not on
    the table, and 1.5 mm of paper is exactly enough to make that a z-fight if
    each works out its own height.

    The lift is the whole modelling idea here. A sheet of paper on a table is
    the easiest thing in the world to model as a rectangle and the easiest thing
    in the world to recognise as one: real paper has been folded, and it never
    lies down again. Corners up, middle flat -- a fourth power of the distance
    from the centre in each direction, so the rise is nothing at all over the
    middle two-thirds and then goes quickly at the edges, which is the shape a
    crease actually relaxes to.
    """
    length, width = params.DESK_CHART
    station0 = params.DESK_CHART_STATION - length / 2
    x0 = edge - 0.020
    rise = 0.0045
    thickness = 0.0015

    across, along = 5, 6
    rings = []
    for i in range(along):
        u = i / (along - 1)
        station = station0 + length * u
        y = _y(station)

        line = []
        for j in range(across):
            v = j / (across - 1)
            x = x0 - width * v
            lift = rise * ((2 * u - 1) ** 4 + 0.6 * (2 * v - 1) ** 4)
            line.append((x, top + lift))

        # Top surface out, under-surface back: one closed section per station.
        rings.append(
            [(x, y, z + thickness) for (x, z) in line]
            + [(x, y, z) for (x, z) in reversed(line)]
        )

    obj = grid_to_mesh("desk_chart", rings, collection, close_rings=True)
    cap_loop(obj, rings[0])
    cap_loop(obj, list(reversed(rings[-1])))
    _finish(obj, sharp=25.0, bevel_width=None)

    return obj, top + thickness


def _desk_safe(collection, inner, top):
    """A small document safe in the after outboard corner of the table: body, a
    door proud of its face, a combination dial and a lever handle.

    Cornered, not placed. Owner's brief, and the geometry follows it literally:
    the after face is measured off `GALLEY_END` -- the bulkhead the worktop stops
    at -- and the outboard face off the hull's own offset at the stations the
    safe spans, both less `DESK_SAFE_INSET`. Neither is a fitted number, so the
    safe stays in its corner if the block is ever re-proportioned, and it can
    never end up standing through the topsides at its base, which is what a
    fixed offset would risk here: the hull moves 20 mm outboard over the
    worktop's own length.

    Taken at the *worktop*, not at the safe's head. The topsides flare as they
    rise, so the narrowest the hull gets over the safe's 230 mm is at its foot,
    and that is the height the outboard face has to clear.

    The exhibit that will be authentication, so it is built to be recognised at
    a glance and from one angle -- the door faces inboard, at the person sitting
    at the table and at the camera stop across the cabin, and everything that
    says "safe" rather than "box" is on that one face. Nothing is modelled on the
    three faces that are against the hull, against the bulkhead, or turned away.

    The door hinges on its forward edge, which is the corner's doing too: with
    the bulkhead immediately abaft it, a door hung on the after edge is a door
    that opens into a wall. The handle goes at the free edge, where it always is.

    The door stands 8 mm proud of the body rather than being let into it, which
    is backwards for a real safe and right for this one: a recess cut into a
    lofted solid renders as nothing at all (the same argument the anchor box's
    lid and the bilge hatch settled), while 8 mm of overlap throws a shadow line
    round all four sides of the door and reads as a door from anywhere.
    """
    length, depth, height = params.DESK_SAFE
    inset = params.DESK_SAFE_INSET

    b = params.GALLEY_END - inset
    a = b - length
    centre = (a + b) / 2
    # Outboard face against the topsides, at the narrowest station it spans.
    reach = min(inner(station, top) for station in (a, b))
    back = -(reach - inset)      # outboard face of the body, signed (port)
    face = back + depth          # the door, facing inboard
    z1 = top + height

    body = _box(
        "desk_safe_body", collection, a, b, face, back, top, z1,
        sharp=30.0, bevel_width=0.003, bevel_segments=2,
    )

    door = _box(
        "desk_safe_door", collection,
        a + 0.014, b - 0.014,
        face + 0.008, face,
        top + 0.014, z1 - 0.014,
        sharp=30.0, bevel_width=0.002, bevel_segments=2,
    )

    # Hinges, on the *forward* edge of the door, so it opens away from the
    # bulkhead the safe is backed into rather than into it.
    hinges = [
        _box(
            f"desk_safe_hinge_{i}", collection,
            a + 0.006, a + 0.020,
            face + 0.013, face + 0.002,
            top + z, top + z + 0.022,
            sharp=30.0, bevel_width=None,
        )
        for i, z in enumerate((0.042, height - 0.064))
    ]

    # The dial, proud of the door on a short brass boss. The door faces
    # athwartships, so the dial's axis does too and its section is a ring in
    # the fore-and-aft plane -- `_ring_along`, and the distinction matters:
    # built on the other axis it came out as a brass teardrop lying on the door.
    dial_station = centre - 0.030
    dial_z = top + height * 0.58
    dial_rings = [
        _ring_along(dial_station, face + 0.008, dial_z, 0.038, count=20),
        _ring_along(dial_station, face + 0.020, dial_z, 0.038, count=20),
        _ring_along(dial_station, face + 0.024, dial_z, 0.032, count=20),
        _ring_along(dial_station, face + 0.025, dial_z, 0.031, count=20),
    ]
    dial = grid_to_mesh("desk_safe_dial", dial_rings, collection, close_rings=True)
    cap_loop(dial, list(reversed(dial_rings[0])))
    cap_loop(dial, dial_rings[-1])
    # A straight cylinder wall with a chamfer and a flat top, and the smoothing
    # angle held down to keep those three apart. Given a tapering profile and a
    # 40-degree smooth this came out as a polished brass dome -- a doorknob, not
    # a dial. What says combination lock is the flat face turned at the viewer
    # and the rim standing round it, and both need a hard edge to exist.
    _finish(dial, sharp=24.0, bevel_width=None)

    # The index mark: the fixed pointer a dial is read against, on the door
    # above it. Two millimetres of brass, and the only reason the disc below it
    # reads as something that turns.
    index = _box(
        "desk_safe_index", collection,
        dial_station - 0.002, dial_station + 0.002,
        face + 0.008, face + 0.013,
        dial_z + 0.041, dial_z + 0.050,
        sharp=30.0, bevel_width=None,
    )

    # A lever handle forward of the dial: a round bar standing off the door on
    # two bosses, not a plate lying on it. The bosses are the whole point --
    # without them the bar is welded to the face and the shadow that says
    # "this is something you take hold of" never appears under it.
    handle_station = centre + 0.070
    bar = _pipe(
        "desk_safe_handle",
        collection,
        [
            (face + 0.030, _y(handle_station), dial_z - 0.052),
            (face + 0.030, _y(handle_station), dial_z + 0.052),
        ],
        0.008,
        count=8,
    )
    bosses = [
        _pipe(
            f"desk_safe_boss_{i}",
            collection,
            [
                (face + 0.002, _y(handle_station), dial_z + dz),
                (face + 0.030, _y(handle_station), dial_z + dz),
            ],
            0.010,
            count=8,
        )
        for i, dz in enumerate((-0.044, 0.044))
    ]

    return [body, door] + hinges, [dial, index, bar] + bosses


def _desk_pipe(collection, edge, chart_top):
    """A briar pipe resting on the chart: bowl standing, stem down to the paper.

    Two materials, which is what a pipe is: the bowl and shank are briar, the
    stem and bit are black vulcanite, and the join between them is the most
    recognisable thing about the object after its silhouette. Built as a
    hollowed bowl rather than a solid one for the reason the sink was --
    a cylinder with a flat top is a cup at best -- and the hollow is four rings
    deep, which is all that is ever seen of it from above.
    """
    station = params.DESK_PIPE_STATION
    # Far enough outboard that the whole of it, stem and bit included, is on the
    # table. The first pass stood the bowl 60 mm in from the worktop's inboard
    # edge and let the stem run forward and inboard from there, which put the
    # bit 22 mm past the edge and hanging in the walkway -- a pipe that had been
    # put down where it would have fallen off.
    x = edge - 0.135
    foot = chart_top - 0.0005

    # Bowl: out and up, then in over the rim and down inside to a floor.
    bowl_rings = [
        _oval_ring(station, x, 0.0155, 0.0155, foot + 0.002),
        _oval_ring(station, x, 0.0185, 0.0185, foot + 0.012),
        _oval_ring(station, x, 0.0205, 0.0205, foot + 0.044),
        _oval_ring(station, x, 0.0160, 0.0160, foot + 0.044),
        _oval_ring(station, x, 0.0140, 0.0140, foot + 0.020),
    ]
    bowl = grid_to_mesh("desk_pipe_bowl", bowl_rings, collection, close_rings=True)
    cap_loop(bowl, list(reversed(bowl_rings[0])))
    cap_loop(bowl, bowl_rings[-1])
    _finish(bowl, sharp=40.0, bevel_width=None)

    # Shank and stem: forward and inboard from the base of the bowl, falling to
    # the paper. Briar as far as the join, vulcanite from there to the bit.
    shank = _pipe(
        "desk_pipe_shank",
        collection,
        [
            (x + 0.012, _y(station - 0.006), foot + 0.016),
            (x + 0.030, _y(station - 0.030), foot + 0.013),
        ],
        0.0072,
        count=8,
    )
    stem = _pipe(
        "desk_pipe_stem",
        collection,
        [
            (x + 0.030, _y(station - 0.030), foot + 0.013),
            (x + 0.056, _y(station - 0.066), foot + 0.008),
            (x + 0.072, _y(station - 0.090), foot + 0.005),
        ],
        0.0058,
        count=8,
    )
    bit = _box(
        "desk_pipe_bit",
        collection,
        station - 0.104, station - 0.088,
        x + 0.070, x + 0.082,
        foot + 0.002, foot + 0.008,
        sharp=30.0, bevel_width=0.0012,
    )

    return join([bowl, shank], "desk_pipe"), [stem, bit]


def _desk_pencils(collection, edge, chart_top):
    """Two pencils on the chart, hexagonal, sharpened.

    Six-sided, which costs two facets over a cylinder and is the only thing that
    tells a pencil from a piece of dowel at this size -- a hexagon catches a
    different light on each of three visible faces, and the flats are why a
    pencil on a sloping chart table has not rolled off it.

    Not laid parallel. Two objects at exactly the same angle read as one object
    duplicated, which is what they are, and the whole job of the pair is to look
    like two things put down at different moments.

    Returns `(bodies, points)`: the lacquered hexagon and the sharpened end,
    apart, because the dark point is the single feature that says pencil and it
    cannot say it in the same yellow as the barrel.
    """
    z = chart_top + 0.0038
    specs = (
        (params.DESK_PENCIL_STATION, edge - 0.038, 0.0),
        (params.DESK_PENCIL_STATION - 0.026, edge - 0.072, 0.030),
    )

    bodies, points = [], []
    for i, (station, x, skew) in enumerate(specs):
        tail, nose = station + 0.088, station - 0.088
        bodies.append(
            _pipe(
                f"desk_pencil_{i}",
                collection,
                [(x, _y(tail), z), (x + skew, _y(nose + 0.016), z)],
                0.0038,
                count=6,
            )
        )
        # The sharpened end: the body's own section run down to a point.
        tip_rings = [
            _ring_across(nose + 0.016, x + skew, z, 0.0038, count=6),
            _ring_across(nose + 0.004, x + skew, z, 0.0016, count=6),
            _ring_across(nose, x + skew, z, 0.0004, count=6),
        ]
        tip = grid_to_mesh(
            f"desk_pencil_tip_{i}", tip_rings, collection, close_rings=True
        )
        cap_loop(tip, list(reversed(tip_rings[-1])))
        points.append(_finish(tip, sharp=40.0, bevel_width=None))

    return bodies, points


# --------------------------------------------------------------------------
# The VHF set
# --------------------------------------------------------------------------


def _build_vhf(collection):
    """The VHF on the after bulkhead, starboard of the way below.

    A placeholder -- it becomes the exhibit that raises a passing ship -- and it
    is built like the instruments on the main bulkhead rather than like a box
    with a label on it, because a placeholder that does not read as the thing it
    stands for teaches the visitor to ignore it.

    Four things say VHF and nothing else does: a squared black set, a lit
    display, a pair of round knobs at one end of the face, and a handset on a
    clip beside it with a coiled cord hanging off it. The cord is the one that
    carries furthest -- it is the only curve in the whole assembly, and a coil
    of it against a flat panel is recognisable from across the cabin at a size
    where the display is two pixels.

    Where it goes is `params.VHF_*`, which explains itself: the panel starboard
    of the steps is a 50 mm lintel over the quarter berth's entrance inboard,
    and a clear 240 mm field outboard of x = 0.60. This sits in the field.
    """
    width, height, proud = params.VHF_SIZE
    face_station = params.VHF_STATION            # the panel's own forward face
    front = face_station - proud
    x = params.VHF_X
    z = params.VHF_HEIGHT

    body = _box(
        "vhf_body", collection,
        front, face_station,
        x - width / 2, x + width / 2,
        z - height / 2, z + height / 2,
        sharp=30.0, bevel_width=0.003, bevel_segments=2,
    )

    # The face, a plate set 10 mm inside the body's outline and standing 3 mm
    # off its front -- so the body reads as a case with a fascia in it.
    face = _box(
        "vhf_face", collection,
        front - 0.003, front,
        x - width / 2 + 0.010, x + width / 2 - 0.010,
        z - height / 2 + 0.010, z + height / 2 - 0.010,
        sharp=30.0, bevel_width=0.0015,
    )

    # The display, over the inboard two-thirds of the face.
    screen = _box(
        "vhf_screen", collection,
        front - 0.005, front - 0.003,
        x - width / 2 + 0.018, x + width / 2 - 0.062,
        z - 0.004, z + height / 2 - 0.018,
        sharp=30.0, bevel_width=None,
    )

    # Volume and squelch, at the outboard end where a hand reaching from the
    # bottom step finds them without the set having to be looked at.
    knobs = []
    for i, kx in enumerate((0.048, 0.018)):
        knob_x = x + width / 2 - kx
        rings = [
            _ring_across(front - 0.003, knob_x, z - 0.020, 0.014),
            _ring_across(front - 0.014, knob_x, z - 0.020, 0.014),
            _ring_across(front - 0.017, knob_x, z - 0.020, 0.010),
        ]
        knob = grid_to_mesh(f"vhf_knob_{i}", rings, collection, close_rings=True)
        cap_loop(knob, rings[-1])
        knobs.append(_finish(knob, sharp=40.0, bevel_width=None))

    handset, cord = _vhf_handset(collection, front, x + width / 2, z)

    return {
        "vhf": join([body, face] + knobs + [handset, cord], "vhf"),
        "vhf_screen": screen,
    }


def _vhf_handset(collection, front, x_edge, z):
    """The handset on its clip, and the coiled cord hanging from it.

    The cord is a helix swept by `_pipe`, three and a half turns of it falling
    from the handset's heel. It hangs below the foot of the bulkhead panel,
    into the opening over the quarter berth, which looks like an oversight and
    is not: that opening is where a real handset's cord hangs, because there is
    nothing else under it, and a cord that stopped dead at the panel's edge
    would be the thing that looked wrong.
    """
    x = x_edge + 0.038
    body = _box(
        "vhf_handset", collection,
        front + 0.012, params.VHF_STATION,
        x - 0.026, x + 0.026,
        z - 0.066, z + 0.062,
        sharp=30.0, bevel_width=0.004, bevel_segments=2,
    )

    turns, drop, radius = 3.5, 0.062, 0.017
    steps = 22
    path = []
    for i in range(steps + 1):
        t = i / steps
        angle = 2 * pi * turns * t
        path.append(
            (
                x + radius * sin(angle) * (0.35 + 0.65 * t),
                _y(params.VHF_STATION - 0.020 - radius * (1 - cos(angle)) * 0.5),
                z - 0.070 - drop * t,
            )
        )
    cord = _pipe("vhf_cord", collection, path, 0.0035, count=6)

    return body, cord


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


BOOK_COVER = 0.0025
"""Thickness of a board -- front, back and spine, all the one piece of cloth-
covered card that a case binding is."""

BOOK_PAGE_INSET = 0.004
"""How far the page block sits inside the boards, at the fore-edge and at head
and tail. The overhang ("the square") is what a case binding has and a perfect-
bound paperback does not, and at 4 mm it is the whole reason a book on this
shelf reads as a book and not as a coloured brick: it puts a line of shadow
between the cloth and the paper on three sides of every one of them."""

# Each run is (side, first station, [(height, spine, cloth, lean), ...]).
#
# `cloth` indexes params.BOOK_CLOTHS; `lean` is the shear, in metres of tip per
# metre of height, applied to a book that is not standing straight. Sizes are
# a real shelf's: nothing here is taller than 210 mm, because the shelf has
# 260 mm of headroom under the deckhead at its forward end and a book that
# does not fit is a book nobody put there.
_BOOK_RUNS = (
    # Starboard, forward: the long run, alongside the saloon table. The tail
    # of named and ordinary books goes at the after end of it -- see
    # `_BOOK_TAIL`.
    #
    # They were at the after end of the *third* run to begin with, at the
    # visitor's own shoulder as the camera arrives below, which is a good place
    # for a thing you want noticed and the wrong place for these. The app
    # walks the camera in to read them (`cameraFocus.ts`), and the move it plays
    # is a first-person side-step past the saloon table -- squeezing through the
    # 290 mm between the table's edge and the settee front, which is what a
    # person actually does to get at this shelf. That move only exists if the
    # books are beside the table. Aft of it there is nothing to squeeze past and
    # the animation would be a mime.
    (1, 3.290, (
        (0.192, 0.028, 0, 0.00),
        (0.205, 0.019, 2, 0.00),
        (0.176, 0.034, 4, 0.00),
        (0.198, 0.022, 1, 0.00),
        (0.163, 0.026, 3, 0.09),   # tipped against its neighbour
        (0.184, 0.031, 2, 0.00),
        (0.171, 0.018, 0, 0.00),
    )),
    # Port, forward of the chart table: a shorter run, because the port shelf
    # is 1.4 m against starboard's 1.9 and it stops at the joinery.
    (-1, 3.420, (
        (0.187, 0.024, 1, 0.00),
        (0.166, 0.030, 4, 0.00),
        (0.201, 0.020, 0, 0.00),
        (0.178, 0.027, 3, 0.07),
        (0.190, 0.023, 2, 0.00),
    )),
    # Starboard, aft: a short group at the visitor's own shoulder when the
    # camera arrives in the cabin. Ordinary books -- what it is for is to stop
    # the forward run reading as the one place on the boat anybody keeps any.
    (1, 4.640, (
        (0.181, 0.029, 3, 0.00),
        (0.196, 0.021, 0, 0.00),
        (0.169, 0.025, 4, 0.00),
    )),
)

_BOOK_TAIL = (
    # (name, height, spine, cloth, lean) -- the after end of the forward
    # starboard run, in the loop's own internal shape. `name` is a string for
    # a book the app addresses by mesh name, in which case `cloth` is `None`
    # and it takes the palette's reserved last cloth, gilt-banded, kept out of
    # the pooled joins; `name` is `None` for an ordinary book, pooled by
    # cloth like any other and given a real cloth index.
    #
    # Two ordinary books sit between `book_about` and `book_github` on
    # purpose, so the third exhibit reads as found on the shelf rather than
    # bolted on beside the other two. Both fillers stand upright: a tipped
    # book at this end would lean against an exhibit book, and the app hangs
    # a hit box and gilt lettering on those, so leaning geometry into them is
    # a problem worth avoiding rather than debugging later.
    ("book_resume", 0.209, 0.036, None, 0.00),
    ("book_about",  0.199, 0.032, None, 0.00),
    (None,          0.183, 0.027, 1,    0.00),
    (None,          0.171, 0.021, 3,    0.00),
    ("book_github", 0.204, 0.030, None, 0.00),
)

_PLACEHOLDER_RUN = 0
"""Which of `_BOOK_RUNS` the tail of named and ordinary books is added to.
Named rather than written as a bare index in the loop, because it is the one
thing in this file the app's camera work depends on: `src/scene/cameraFocus.ts`
walks the viewer to this run and nowhere else."""


def _build_books(collection, inner):
    """The shelf's books: three runs of them, three of which are exhibits.

    This used to be four boxes over one settee, with a docstring arguing that a
    full run both sides is more library than a 7.6 m cruiser carries. That
    argument was about *quantity* and it is still right -- there are twenty
    books here, not a wall of them, and the port run stops well short of the
    chart table. What it was quietly also doing was excusing four identical
    brown blocks, and four identical brown blocks is not a small number of
    books, it is a bad model of any number of them.

    So each book is now built the way a book is made rather than the way a book
    is shaped. Three pieces:

      the case -- front board, spine and back board, one continuous U of
      cloth-covered card, so the boards stand proud of what is between them;

      the page block, inset from the case by `BOOK_PAGE_INSET` at the fore-edge
      and at head and tail, in paper rather than cloth;

      gilt, on the named exhibits only.

    The U is what earns its keep. A solid box has one silhouette and one
    material, and no amount of colour makes a row of them read as books; a case
    with a page block inside it has a shadow line down three sides of every
    book, and the eye reads those lines as *made objects* before it has decided
    what they are. `_BOOK_RUNS` then does the rest -- six cloths, no two
    neighbours the same, spines from 18 to 36 mm, and two books tipped over
    against their neighbours, because a shelf where every book stands to
    attention is a shelf nobody has ever taken a book off.

    Returns one object per cloth colour, plus the paper and the gilt, so each
    can carry its own material -- see `params.BOOK_CLOTHS`.
    """
    z0 = params.SHELF_LEVEL + params.SHELF_THICKNESS
    cases = {i: [] for i in range(len(params.BOOK_CLOTHS) - 1)}
    placeholder_names = {name for (name, _, _, _, _) in _BOOK_TAIL if name}
    parts, pages, gilt = {}, [], []

    for run_index, (side, first, spec) in enumerate(_BOOK_RUNS):
        station = first
        aft_limit = SHELF_END[side] - 0.030
        tail = _BOOK_TAIL if run_index == _PLACEHOLDER_RUN else ()

        books = [(f"book_{run_index}_{i}", h, s, cloth, lean)
                 for i, (h, s, cloth, lean) in enumerate(spec)]
        # The named books in the tail take the last cloth in the palette,
        # whatever it is, and `None` here means "not one of the pooled
        # cloths" -- they are kept out as objects of their own. The ordinary
        # ones in the tail are given a real cloth index and a pooled name
        # that cannot collide with the spec loop's own naming above.
        books += [
            (name if name else f"book_{run_index}_t{i}", h, s, cloth, lean)
            for i, (name, h, s, cloth, lean) in enumerate(tail)
        ]

        for name, height, spine, cloth, lean in books:
            if station + spine > aft_limit:
                break

            # This book's own offsets, at its own stations -- see `_book_bounds`
            # for the two versions of this that took them per run and per boat,
            # and what each of those cost.
            bounds = _book_bounds(inner, z0, height, station, station + spine)
            if bounds[1] <= bounds[0] + BOOK_COVER * 2:
                station += spine + 0.0035
                continue

            case, block = _book(
                name, collection, side, station, spine, height, z0, lean, bounds
            )
            pages.append(block)
            if name in placeholder_names:
                # One object each. The pooled runs join by cloth because
                # nothing ever needs to address a particular novel, but these
                # three are exhibits: the app hangs a hotspot on
                # `book_resume`, `book_about` and `book_github`, and it finds
                # them by mesh name.
                case.name = case.data.name = name
                parts[name] = case
                gilt += _book_gilt(
                    name, collection, side, station, spine, height, z0, bounds
                )
            else:
                cases[cloth].append(case)
            station += spine + 0.0035

    parts.update(
        {f"books_{i}": join(objs, f"books_{i}") for i, objs in cases.items() if objs}
    )
    parts["book_pages"] = join(pages, "book_pages")
    parts["book_gilt"] = join(gilt, "book_gilt")
    return parts


def _book_bounds(inner, z0, height, start, end):
    """Where one book stands on the shelf: `(x_in, x_out)` as positive
    half-offsets, spine inboard, taken at that book's own two stations.

    Per book. That is the third answer this has had, and the other two are worth
    recording because they fail in opposite directions and the second one looked
    right in every render taken of it.

    Taken at one fixed station for the whole boat, books stood 70 mm inboard of
    the fiddle at the after end of the shelf -- floating in mid-air over the
    backrest, which is what the first bookshelf render showed.

    Taken once per *run*, they sit on the shelf and lose their depth. The
    topsides move outboard fast along the saloon -- 44 mm over the 274 mm of the
    forward run -- and one offset for a whole run has to clear the fiddle at the
    run's widest station *and* stay inside the hull at its narrowest, so the run
    pays that 44 mm at both edges. The forward books came out 50 mm deep. They
    read as books across the cabin and as cereal packets at the range the app's
    camera now flies in to (`src/scene/cameraFocus.ts`), which is what found it.

    Per book they are their full 108 mm and every one sits against the fiddle.
    The row is then not quite straight -- it steps outboard about 6 mm a book --
    and that is not a defect, it is the shelf. A book on a fiddled shelf leans
    against the fiddle, the fiddle follows the topsides, so the row follows the
    topsides. What must not happen is books *rotating* to the hull, which would
    be a fan; nothing here rotates, they only sit where the shelf has got to.

    Both heights are still asked for. The hull widens as it rises through the
    shelf, so the narrowest it gets over a book's own height is at its foot, and
    that is what the fore-edge has to clear -- otherwise a 200 mm book stands
    inside the topsides at the shelf and through them at its head.
    """
    fiddle = max(
        inner(station, z0) - params.SHELF_DEPTH + params.FIDDLE_THICKNESS
        for station in (start, end)
    )
    x_in = fiddle + 0.006
    reach = min(
        min(inner(station, z0), inner(station, z0 + height))
        for station in (start, end)
    )
    return x_in, min(x_in + 0.108, reach - 0.014)


def _book(name, collection, side, station, spine, height, z0, lean, bounds):
    """One case-bound book: the cloth case, and the page block inside it.

    The case is a U in plan -- back board, spine, front board -- lofted between
    two heights, so it is one closed surface and not three boxes that happen to
    touch. `lean` shears both pieces by the same amount over the same height, a
    shear rather than a rotation so the foot stays flat on the shelf: a book
    tipped 5 degrees off its neighbour is standing on its bottom edge, not
    balanced on a corner, and at this angle nothing distinguishes the two but
    the arithmetic.
    """
    x_in, x_out = bounds
    t = BOOK_COVER
    a, b = station, station + spine
    top = z0 + height

    def sheared(s, z):
        """A station, carried over by the lean at this height."""
        return s + lean * (z - z0)

    def case_ring(z):
        # Walked as a closed loop: down the spine face, out along the after
        # board, back in along its inside, across the gap, and out and back
        # along the forward board.
        outline = [
            (a, x_in), (b, x_in), (b, x_out), (b - t, x_out),
            (b - t, x_in + t), (a + t, x_in + t), (a + t, x_out), (a, x_out),
        ]
        return [(side * x, _y(sheared(s, z)), z) for (s, x) in outline]

    rings = [case_ring(top), case_ring(z0)]
    case = grid_to_mesh(f"{name}_case", rings, collection, close_rings=True)
    cap_loop(case, rings[0])
    cap_loop(case, list(reversed(rings[1])))
    _finish(case, sharp=25.0, bevel_width=0.0008)

    # The page block, inset from the case on the three edges a book's boards
    # overhang: fore-edge, head and tail. Not at the spine, where the paper is
    # glued to the case and there is nothing to overhang.
    inset = BOOK_PAGE_INSET
    p0, p1 = z0 + inset, top - inset
    block_rings = [
        [
            (side * x, _y(sheared(s, z)), z)
            for (s, x) in (
                (a + t, x_in + t), (b - t, x_in + t),
                (b - t, x_out - inset), (a + t, x_out - inset),
            )
        ]
        for z in (p1, p0)
    ]
    block = grid_to_mesh(f"{name}_pages", block_rings, collection, close_rings=True)
    cap_loop(block, block_rings[0])
    cap_loop(block, list(reversed(block_rings[1])))
    _finish(block, sharp=25.0, bevel_width=None)

    return case, block


def _book_gilt(name, collection, side, station, spine, height, z0, bounds):
    """Two gilt bands across the spine of a placeholder book.

    The one thing that can be done about a spine with no title on it. Every
    texture in this model is world-scale and tiling (`textures.py` says why), so
    there is no way to land lettering on a 32 mm spine and no honest way to
    fake one -- a smeared repeat of an alphabet is worse than nothing.

    What a bound book has instead, and what carries at the range the cabin stop
    actually has on this shelf, is banding: two gilt rules across the spine with
    the title between them. That reads as "this book is titled" from across the
    cabin, which is all a placeholder has to do -- the exhibit's own label is
    DOM, outside the canvas, where text belongs.
    """
    x_in = bounds[0]
    proud = 0.0006

    return [
        _box(
            f"{name}_gilt_{i}",
            collection,
            station + 0.004,
            station + spine - 0.004,
            side * (x_in - proud),
            side * (x_in + 0.0015),
            z0 + height * fraction,
            z0 + height * fraction + 0.004,
            sharp=25.0,
            bevel_width=None,
        )
        for i, fraction in enumerate((0.66, 0.80))
    ]


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


def _build_curtains(collection):
    """A curtain track at each saloon window, with the curtain itself gathered
    to the after end rather than drawn across.

    The two long saloon windows are otherwise the largest bare surface in the
    cabin, and the brochure's own photographs of boats this size that have them
    fitted keep them open -- a boat lying at anchor with the curtains drawn
    reads as shut up rather than lived in.

    Hung off the cabin side, which is a surface `interior.hull_inner_function`
    cannot answer for: the window is above the sheer, where there is no hull
    left, only the deck moulding's band. `deck.cabin_side_x` is the lining's own
    face and `deck.window_edges` the window's own top and bottom -- both asked
    for rather than rebuilt here, which is how this went wrong the first time.
    It measured both edges down from the sheer instead of down from the deck
    edge and hung the whole assembly a band-height -- 206 mm -- below the window
    it belongs to, on blank white topsides above the shelf.
    """
    import deck

    pieces = []

    for w_index, (fwd, aft) in enumerate(params.WINDOWS):
        mid = (fwd + aft) / 2
        top, bottom = deck.window_edges(mid)
        if bottom >= top - 0.030:
            continue

        for side in (-1, 1):
            # The track is screwed to the lining just under the deck edge; the
            # curtain hangs inboard of it.
            x_in = deck.cabin_side_x(mid, top)
            x_out = x_in - 0.012

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


def _instrument(collection, x, z, r, y_back, proud, tag):
    """One glazed brass instrument on the bulkhead: a drawn drum with an inturned
    bezel, a pale dial recessed in it under glass, and a small brass hub.

    Its axis is fore-and-aft (the y of the boat), so the whole thing is a stack
    of circles at falling depths, the way the cabin lamp is. Returns three lists
    -- brass, dial, glass -- kept apart so each can take its own material.

    Depths are measured back from the bezel front (`y_front`); +y is into the
    panel, so everything the eye sees is nested a few millimetres behind the one
    in front of it, far enough apart that nothing z-fights: bezel, glass, hub,
    dial, then the brass floor of the well.
    """
    seg = 20

    def ring(rad, y):
        return [
            (x + rad * cos(2 * pi * i / seg), y, z + rad * sin(2 * pi * i / seg))
            for i in range(seg)
        ]

    y_front = y_back - proud

    # Brass case: back disc against the panel, drum wall, flat bezel annulus,
    # bezel inner wall stepping back to the well floor.
    seat = y_front + 0.018
    case = grid_to_mesh(
        f"instrument_case_{tag}",
        [ring(r, y_back), ring(r, y_front), ring(r * 0.82, y_front), ring(r * 0.80, seat)],
        collection,
        close_rings=True,
    )
    cap_loop(case, ring(r, y_back))                        # back, on the panel
    cap_loop(case, list(reversed(ring(r * 0.80, seat))))   # brass floor of well
    brass = [_finish(case, sharp=45.0, bevel_width=None)]

    # Brass centre hub, a small boss proud of the dial.
    hub = grid_to_mesh(
        f"instrument_hub_{tag}",
        [ring(r * 0.10, y_front + 0.008), ring(r * 0.10, y_front + 0.006),
         ring(r * 0.045, y_front + 0.006)],
        collection,
        close_rings=True,
    )
    cap_loop(hub, list(reversed(ring(r * 0.045, y_front + 0.006))))
    brass.append(_finish(hub, sharp=45.0, bevel_width=None))

    # Pale dial, a shallow slab seated in the well behind the hub.
    dial = grid_to_mesh(
        f"instrument_dial_{tag}",
        [ring(r * 0.74, y_front + 0.008), ring(r * 0.74, seat)],
        collection,
        close_rings=True,
    )
    cap_loop(dial, ring(r * 0.74, y_front + 0.008))        # the face, toward the eye
    dials = [_finish(dial, sharp=45.0, bevel_width=None)]

    # Glass, a thin disc closing the bezel over the dial.
    glass = grid_to_mesh(
        f"instrument_glass_{tag}",
        [ring(r * 0.80, y_front + 0.003), ring(r * 0.80, y_front + 0.004)],
        collection,
        close_rings=True,
    )
    cap_loop(glass, ring(r * 0.80, y_front + 0.003))
    glasses = [_finish(glass, sharp=45.0, bevel_width=None)]

    return brass, dials, glasses


def _build_instruments(collection):
    """The brass on the main bulkhead: a matched clock and barometer to one side
    of the way forward, a smaller tell-tale to the other.

    This is the corner of the saloon the cabin stop looks straight at -- the
    camera comes below and faces forward down the boat to this bulkhead -- and it
    is the one below-deck spot the eye goes to that is neither structure nor
    stowage. Every cruised boat of the age has it: a clock and a barometer in
    brass, read from the settee and lit by the companionway behind the lens.

    Placed off the doorway rather than by a half-offset of their own, so the
    group follows the opening. The pair sits together to starboard at a hand's
    pitch; the single, smaller, balances it to port. All three stand on the flat
    aft face of the panel and need no lean -- the bulkhead is upright, unlike the
    coachroof face the cockpit shelves hang on.
    """
    y_back = _y(params.BULKHEAD_AFT + 0.018)
    z = params.INSTRUMENT_HEIGHT
    r = params.INSTRUMENT_RADIUS
    proud = params.INSTRUMENT_PROUD
    edge = params.LOCKER_DOORWAY_HALF_WIDTH

    # (x, radius) for each: the clock and barometer to starboard, a smaller
    # instrument to port, all clear of the doorway edge by a bezel's width.
    first = edge + 0.075 + r
    specs = [
        (first, r),                               # clock, inboard of the pair
        (first + params.INSTRUMENT_SPACING, r),   # barometer, outboard
        (-(edge + 0.075 + r * 0.78), r * 0.78),   # tell-tale, to port
    ]

    brass, dials, glasses = [], [], []
    for i, (x, rad) in enumerate(specs):
        b, d, g = _instrument(collection, x, z, rad, y_back, proud, tag=i)
        brass += b
        dials += d
        glasses += g

    return {
        "instruments": join(brass, "instruments"),
        "instrument_dials": join(dials, "instrument_dials"),
        "instrument_glass": join(glasses, "instrument_glass"),
    }


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
    # 480 x 300, over the keel bolts. Was the sole's own width less 30 mm, which
    # was the same 480 while the walkway was 540 -- and became a 910 mm plate
    # spanning the boat the moment the owner's brief widened it. A bilge hatch
    # is sized by what is under it, not by what is either side of it.
    half = 0.240
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

"""
Everything bolted to the deck: rails, winches, steering and the outboard.

The hull, the deck and the rig are all *shapes* -- long lofted surfaces that
either read as a Maxi 77 or do not. This module is the opposite. Nothing here is
bigger than a forearm, none of it changes the silhouette, and it is all built
from a handful of tubes and boxes.

It matters anyway, and it matters most where the camera stops. The scene puts
the visitor in the cockpit looking forward, and from that seat the traveller is
an arm's length away, the winches are at shoulder height either side, and the
tiller is in the frame the whole time. Those are the only objects on the boat
that will ever be seen from closer than two metres. A cockpit with none of them
is a moulding; a cockpit with them is somewhere someone sails from.

Everything here is placed by *asking the deck where it is* -- `deck.cockpit_widths`
for the well, `deck.deck_edge_half_width` for the side decks,
`deck.cockpit_surface_function`, `deck.aft_deck_function` and
`deck.surface_function` for heights,
`keel_rudder.rudder_axis` for the steering. Nothing carries a coordinate of its
own that the structure underneath it could move away from. That is not tidiness:
the side deck alongside this cockpit is 89 mm wide at the after winch, and a
winch given a fixed offset would be hanging over the water the first time the
beam curve was touched.
"""

from math import cos, hypot, pi, sin

import deck
import keel_rudder
import params
from lib.mesh import cap_loop, grid_to_mesh, join, recalc_normals, shade_smooth
from lib.sweep import circle, sweep_rings


def build(collection):
    """Build the deck fittings. Returns a dict of named objects."""
    cockpit = deck.cockpit_surface_function()
    afterdeck = deck.aft_deck_function()
    foredeck = deck.surface_function()

    return {
        "cockpit_grating": _build_grating(collection, cockpit),
        "traveller": _build_traveller(collection, cockpit),
        "stern_rail": _build_stern_rail(collection, afterdeck),
        "winches": _build_winches(collection, afterdeck),
        "tiller": _build_tiller(collection),
        "pulpit": _build_pulpit(collection, foredeck),
        "pulpit_block": _build_pulpit_block(collection, foredeck),
        "stanchions": _build_stanchions(collection, foredeck),
        "lifelines": _build_lifelines(collection, foredeck),
        "outboard": _build_outboard(collection),
    }


# --------------------------------------------------------------------------
# Shared construction
# --------------------------------------------------------------------------


def _y(station):
    return params.station_to_y(station)


def _lerp(a, b, t):
    return a + (b - a) * t


def _stations(start, end, count):
    step = (end - start) / (count - 1)
    return [start + step * i for i in range(count)]


def _finish(obj, sharp=45.0):
    recalc_normals(obj)
    shade_smooth(obj, sharp_above_degrees=sharp)
    return obj


def _tube(name, collection, path, radius, segments=8):
    """A round bar or wire following a polyline, capped at both ends.

    The path is given in world space, densely enough that the sweep bends
    instead of kinking -- there is no smoothing here, the points are the shape.
    """
    rings = sweep_rings(circle(radius, segments), path)
    obj = grid_to_mesh(name, rings, collection, close_rings=True)
    cap_loop(obj, rings[0])
    cap_loop(obj, list(reversed(rings[-1])))
    return _finish(obj, sharp=50.0)


def _box(name, collection, x0, x1, y0, y1, z0, z1):
    """An axis-aligned box, given as six world coordinates."""
    rings = [
        [(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)] for z in (z1, z0)
    ]
    obj = grid_to_mesh(name, rings, collection, close_rings=True)
    cap_loop(obj, rings[0])
    cap_loop(obj, list(reversed(rings[1])))
    return _finish(obj, sharp=30.0)


def _rounded_section(width, depth, count=14, power=3.0):
    """A closed superellipse: a rectangle with its corners taken off.

    `ellipse` is too round for a cowling or a shaft and a plain rectangle is too
    square, and the difference between the two is most of what makes a moulded
    plastic part look moulded. One exponent covers the range -- 2 is an ellipse,
    large is a rectangle, 3 is an outboard engine cover.
    """
    points = []
    for i in range(count):
        angle = 2 * pi * i / count
        c, s = cos(angle), sin(angle)
        scale = (abs(c) ** power + abs(s) ** power) ** (1 / power)
        points.append((width / 2 * c / scale, depth / 2 * s / scale))
    return points


def _densify(path, per_segment=3):
    """Subdivide a polyline so a swept tube bends rather than kinks."""
    out = [path[0]]
    for a, b in zip(path, path[1:]):
        for i in range(1, per_segment + 1):
            t = i / per_segment
            out.append(tuple(a[k] + (b[k] - a[k]) * t for k in range(3)))
    return out


# --------------------------------------------------------------------------
# The cockpit sole
# --------------------------------------------------------------------------


def cockpit_grating_planks():
    """Where the teak planks in the footwell lie: a list of `(x0, x1)` pairs.

    Laid outwards from a seam on the centreline, as many as fit, and the leftover
    goes into the margin at each side rather than into a narrow plank. How many
    there are is therefore not a number anybody chose -- it falls out of the
    plank width, the gap and how wide the footwell is at its narrowest, which is
    at the after end where the well has already begun to follow the topsides in.

    Returned rather than built inline so `verify.py` can measure the layout
    against the two dimensions it is supposed to have.
    """
    start, end = _grating_span()
    pitch = params.COCKPIT_GRATING_PLANK + params.COCKPIT_GRATING_GAP
    half = params.COCKPIT_GRATING_PLANK / 2

    limit = min(
        deck.cockpit_widths(s)[0] for s in _stations(start, end, 9)
    ) - params.COCKPIT_GRATING_MARGIN

    planks = []
    index = 0
    while pitch / 2 + index * pitch + half <= limit:
        centre = pitch / 2 + index * pitch
        planks.append((-centre - half, -centre + half))
        planks.append((centre - half, centre + half))
        index += 1

    return sorted(planks)


def _grating_span():
    """The stations the flooring runs between.

    Held clear of both ends of the footwell by more than the 60 mm the sole
    takes to round its nose up onto the benches, so every plank lies on flat
    sole and none of them is bent over the lip at either end.
    """
    return params.COCKPIT_FOOTWELL_START + 0.090, params.COCKPIT_FOOTWELL_END - 0.090


def _build_grating(collection, cockpit):
    """Teak flooring in the footwell.

    Each plank is lofted along the boat and sampled off the sole at both of its
    edges, so it takes up the sole's camber the way a laid plank does. Laying
    them flat instead puts the outboard pair 10 mm clear of the moulding at the
    centreline end -- which is small, and is exactly the size of gap that catches
    the light along a metre of edge and reads as flooring that is not touching
    the boat.
    """
    start, end = _grating_span()
    thickness = params.COCKPIT_GRATING_THICKNESS
    clearance = 0.002

    planks = []
    for index, (x0, x1) in enumerate(cockpit_grating_planks()):
        rings = []
        for station in _stations(start, end, 7):
            y = _y(station)
            z0 = cockpit(station, x0) + clearance
            z1 = cockpit(station, x1) + clearance
            rings.append(
                [
                    (x0, y, z0 + thickness),
                    (x1, y, z1 + thickness),
                    (x1, y, z1),
                    (x0, y, z0),
                ]
            )

        obj = grid_to_mesh(f"plank_{index}", rings, collection, close_rings=True)
        cap_loop(obj, rings[0])
        cap_loop(obj, list(reversed(rings[-1])))
        planks.append(_finish(obj, sharp=25.0))

    return join(planks, "cockpit_grating")


# --------------------------------------------------------------------------
# The mainsheet horse
# --------------------------------------------------------------------------


def _build_traveller(collection, cockpit):
    """A bar across the step at the forward end of the well, on two feet.

    The step it stands on is moulded, not level -- the deck edge above it drops
    120 mm between the cockpit bulkhead and the after coaming and the whole tray
    goes with it -- so the two feet are different heights and are measured
    separately off the surface. The bar itself is level, because a horse the
    blocks run along has to be.
    """
    station = params.TRAVELLER_STATION
    y = _y(station)
    half = params.TRAVELLER_HALF_WIDTH
    foot = params.TRAVELLER_FOOT

    bar_z = cockpit(station, 0.0) + params.TRAVELLER_STAND

    pieces = [
        _tube(
            "traveller_bar",
            collection,
            [(-half, y, bar_z), (half, y, bar_z)],
            params.TRAVELLER_RADIUS,
            segments=10,
        )
    ]

    for side in (-1, 1):
        x = side * (half - foot / 2 - 0.010)
        pieces.append(
            _box(
                f"traveller_foot_{side}",
                collection,
                x - foot / 2,
                x + foot / 2,
                y - foot / 2,
                y + foot / 2,
                cockpit(station, x),
                bar_z,
            )
        )

    return join(pieces, "traveller")


# --------------------------------------------------------------------------
# The after rail and the winches
# --------------------------------------------------------------------------


def _coaming_rail_x(station):
    """Where a rail lying on the coaming sits, at a station.

    On the coaming where there is side deck to hold it, and inboard of the deck
    edge where there is not -- which is most of the after end of this cockpit.
    The well is 2 m wide and the boat is 1.9 m wide at station 7000, so from
    there aft the side deck is 10 mm across and the coaming *is* the deck edge.
    """
    _, _, coaming = deck.cockpit_widths(station)
    edge = deck.deck_edge_half_width(station)
    return min(coaming, edge - params.STERN_RAIL_RADIUS - 0.004)


def _stern_rail_path(afterdeck):
    """The rail from the deck at one forward end to the deck at the other: up
    through the bend, aft along the coaming, round the after corner, across the
    back of the well, and out again the other side.

    Built as one starboard half and mirrored, so the two sides cannot come out
    different lengths, and sampled off the deck at every point so the
    athwartships run takes up the crown rather than floating over the middle of
    it by the 47 mm of camber there is at the centreline.
    """
    aft = params.COCKPIT_END + 0.015
    radius = params.STERN_RAIL_CORNER
    corner = aft - radius
    forward = aft - params.STERN_RAIL_RETURN

    stand = params.STERN_RAIL_STAND
    bend = params.STERN_RAIL_BEND

    # The forward leg: down the deck, then a quarter turn aft into the rail. The
    # bend is what makes it one tube rather than a rail sitting on a stanchion.
    foot_x = _coaming_rail_x(forward)
    foot_z = afterdeck(forward, foot_x)

    path = [
        (foot_x, _y(forward), foot_z),
        (foot_x, _y(forward), foot_z + stand - bend),
    ]

    # Quarter turn, centred a bend's radius up the leg and a bend aft of it, so
    # the tube leaves vertical and arrives level.
    for i in range(1, 5):
        angle = (pi / 2) * i / 4
        station = forward + bend * (1 - cos(angle))
        path.append(
            (
                _coaming_rail_x(station),
                _y(station),
                foot_z + stand - bend * (1 - sin(angle)),
            )
        )

    plan = [
        (station, _coaming_rail_x(station))
        for station in _stations(forward + bend, corner, 3)
    ]

    # Quarter circle from the coaming, heading aft, round to the athwartships
    # run, heading inboard.
    corner_x = _coaming_rail_x(corner)
    for i in range(1, 7):
        angle = (pi / 2) * i / 6
        plan.append(
            (corner + radius * sin(angle), corner_x - radius + radius * cos(angle))
        )

    # Half the athwartships run, in to the centreline.
    inner = corner_x - radius
    plan.extend((aft, inner * (1 - i / 3)) for i in range(1, 4))

    path.extend(
        (x, _y(station), afterdeck(station, x) + stand) for (station, x) in plan
    )
    return path + [(-x, y, z) for (x, y, z) in reversed(path[:-1])]


def _build_stern_rail(collection, afterdeck):
    """The pushpit round the back of the cockpit: one bent tube a side, plus two
    straight legs on the after edge.

    The two straight legs stand inboard of the corners and outboard of the
    centreline, which is not a compromise -- it is the gap the tiller comes
    through. Everything back here has to share 1.5 m of transom with a steering
    arm that sweeps across all of it.
    """
    path = _densify(_stern_rail_path(afterdeck), per_segment=2)
    pieces = [
        _tube(
            "stern_rail_hoop",
            collection,
            path,
            params.STERN_RAIL_RADIUS,
            segments=10,
        )
    ]

    aft = params.COCKPIT_END + 0.015
    for side in (-1, 1):
        x = side * params.STERN_RAIL_LEG_HALF_BEAM
        foot = afterdeck(aft, x)
        pieces.append(
            _tube(
                f"stern_rail_leg_{side}",
                collection,
                [
                    (x, _y(aft), foot),
                    (x, _y(aft), foot + params.STERN_RAIL_STAND),
                ],
                params.STERN_RAIL_RADIUS * 0.85,
            )
        )

    return join(pieces, "stern_rail")


def winch_centre(station):
    """Where a winch stands: the middle of whatever side deck there is.

    Centred rather than offset, because the side deck alongside this cockpit runs
    from 157 mm wide to 89 mm over the length of the pair, and a winch placed a
    fixed distance from either edge falls off the other one.
    """
    _, _, coaming = deck.cockpit_widths(station)
    return (coaming + deck.deck_edge_half_width(station)) / 2


def _build_winches(collection, afterdeck):
    """Two small sheet winches a side.

    A stack of circles: base flange, waisted drum, top flange, and the drum head
    above it. There is no self-tailing arm and no handle -- at 80 mm across, the
    thing that says winch is the waist between the two flanges, and everything
    else is faces spent on something nobody can resolve.
    """
    base = params.COCKPIT_WINCH_BASE
    waist = params.COCKPIT_WINCH_WAIST
    height = params.COCKPIT_WINCH_HEIGHT

    profile = [
        (base, 0.000),
        (base, 0.014),
        (waist, 0.032),
        (waist, height - 0.032),
        (base, height - 0.018),
        (base * 0.94, height - 0.006),
        (base * 0.62, height),
    ]

    drums = []
    for station in params.COCKPIT_WINCH_STATIONS:
        centre = winch_centre(station)
        for side in (-1, 1):
            x = side * centre
            foot = afterdeck(station, centre)
            rings = [
                [
                    (
                        x + radius * cos(2 * pi * i / 12),
                        _y(station) + radius * sin(2 * pi * i / 12),
                        foot + lift,
                    )
                    for i in range(12)
                ]
                for (radius, lift) in profile
            ]

            name = f"winch_{station:.2f}_{'p' if side < 0 else 's'}"
            obj = grid_to_mesh(name, rings, collection, close_rings=True)
            cap_loop(obj, rings[0])
            cap_loop(obj, list(reversed(rings[-1])))
            drums.append(_finish(obj, sharp=40.0))

    return join(drums, "winches")


# --------------------------------------------------------------------------
# Steering
# --------------------------------------------------------------------------


def tiller_path():
    """The centreline of the steering arm, as `(station, z)` in the fore-and-aft
    plane: up the back of the rudder, round the elbow, and forward into the well.

    The rise is parallel to the rudder's own leading edge, 45 mm abaft it, so the
    arm is bolted to the blade rather than crossing it -- and it stays bolted to
    it if the transom rake or the freeboard moves, because both ends of the rise
    come from `keel_rudder.rudder_axis`.

    The elbow is a quadratic through the corner rather than a mitre. It is the
    part of this the eye actually reads: a bent tiller is one piece of wood
    steamed round a curve, and a mitred one is two sticks screwed together.
    """
    hinge, rake = keel_rudder.rudder_axis()
    offset = 0.045

    def on_blade(z):
        return hinge + (z - params.RUDDER_TOP) * rake + offset

    z_head = params.FREEBOARD_STERN + params.TILLER_HEAD_ABOVE_SHEER
    z_tip = params.FREEBOARD_STERN + params.TILLER_TIP_ABOVE_SHEER
    z_root = params.RUDDER_TOP - 0.055

    root = (on_blade(z_root), z_root)
    apex = (on_blade(z_head), z_head)
    tip = (params.TILLER_TIP_STATION, z_tip)

    def along(frm, to, distance):
        ds, dz = to[0] - frm[0], to[1] - frm[1]
        length = hypot(ds, dz)
        return (frm[0] + ds / length * distance, frm[1] + dz / length * distance)

    entry = along(apex, root, 0.150)
    exit_ = along(apex, tip, 0.260)

    path = [root]
    path.extend(_line(root, entry, 3)[1:])
    path.extend(_quadratic(entry, apex, exit_, 8)[1:])
    path.extend(_line(exit_, tip, 7)[1:])
    return path


def _line(a, b, count):
    return [
        (_lerp(a[0], b[0], i / (count - 1)), _lerp(a[1], b[1], i / (count - 1)))
        for i in range(count)
    ]


def _quadratic(a, control, b, count):
    out = []
    for i in range(count):
        t = i / (count - 1)
        u = 1 - t
        out.append(
            tuple(
                u * u * a[k] + 2 * u * t * control[k] + t * t * b[k] for k in range(2)
            )
        )
    return out


def _build_tiller(collection):
    """The wooden steering arm.

    Swept in the fore-and-aft plane with its own frame rather than through
    `sweep_rings`, because this is the one member here that is not round: it is
    a laminated bar, wider than it is deep, and which way up it lies matters.
    Working in the plane the whole thing lives in makes that a two-line
    calculation instead of a transported frame that has to be trusted.

    Tapered root to tip over its arc length, as a tiller is -- the end you hold
    is half the section of the end that takes the load.
    """
    path = tiller_path()

    lengths = [0.0]
    for a, b in zip(path, path[1:]):
        lengths.append(lengths[-1] + hypot(b[0] - a[0], b[1] - a[1]))
    total = lengths[-1]

    rings = []
    for i, (station, z) in enumerate(path):
        ahead = path[min(i + 1, len(path) - 1)]
        behind = path[max(i - 1, 0)]
        ds, dz = ahead[0] - behind[0], ahead[1] - behind[1]
        span = hypot(ds, dz)

        # The in-plane normal. Stations run the other way from y, so the sign
        # here is what keeps the section upright rather than inside out.
        normal = (dz / span, ds / span)

        t = lengths[i] / total
        width = _lerp(params.TILLER_ROOT_SECTION[0], params.TILLER_TIP_SECTION[0], t)
        depth = _lerp(params.TILLER_ROOT_SECTION[1], params.TILLER_TIP_SECTION[1], t)

        rings.append(
            [
                (u, _y(station) + normal[0] * v, z + normal[1] * v)
                for (u, v) in _rounded_section(width, depth, count=10, power=2.6)
            ]
        )

    obj = grid_to_mesh("tiller", rings, collection, close_rings=True)
    cap_loop(obj, rings[0])
    cap_loop(obj, list(reversed(rings[-1])))
    return _finish(obj, sharp=45.0)


# --------------------------------------------------------------------------
# Pulpit, stanchions and lifelines
# --------------------------------------------------------------------------


GUARDRAIL_MIN_HALF_WIDTH = 0.060
"""How narrow the guardrail line is allowed to get, before the deck stops it.

The pulpit has to have a nose rather than a point, and the boat has no width to
give it one: 150 mm aft of the stem the deck is 90 mm across. This is the width
the nose keeps for as long as there is deck under it, which is back to about
station 180 -- so the hoop closes across the stemhead fitting and the forestay
lands inside it, which is what a pulpit is for."""


def _rail_x(station):
    """Half-offset of the guardrail line at a station: inboard of the deck edge
    by a stanchion base, held out to a minimum, and never off the deck.

    All three bind somewhere. The inset rules amidships, the minimum rules over
    the last half metre, and the deck rules right in the bow where there is not
    even 60 mm of it.
    """
    edge = deck.deck_edge_half_width(station)
    return min(
        max(GUARDRAIL_MIN_HALF_WIDTH, edge - params.STANCHION_INSET),
        max(0.0, edge - 0.010),
    )


def stanchion_stations():
    """Where the guardrail posts stand: the after one just ahead of the
    companionway, the forward one half way from there to the pulpit.

    Taken off the doorway rather than given, so that "almost in line with the top
    of the way below" stays true when the coachroof's lean or the sill moves.
    Both of those have moved once already.

    The head of the doorway is not at the coachroof's after station: the face
    leans forward, so the top of the opening is a good 150 mm ahead of the bottom
    of it. That is the station this is measured from, because it is the one you
    see from the cockpit.
    """
    station = params.COACHROOF_END
    _, _, head = deck.companionway_opening()
    head_station = station - deck.companionway_lean(station, head)

    aft = head_station - params.STANCHION_AHEAD_OF_COMPANIONWAY
    return ((aft + params.PULPIT_FOOT_STATION) / 2, aft)


def _pulpit_leg_top(station, side):
    """The top of a pulpit leg: raked forward of its own foot and splayed
    outboard of it."""
    top_station = station - params.PULPIT_LEG_RAKE
    return top_station, side * (_rail_x(station) + params.PULPIT_LEG_SPLAY)


def _pulpit_plan():
    """The pulpit in plan: aft on one side, round the stemhead, aft on the other.

    Starts at the top of the raked leg rather than over its foot, and carries the
    leg's splay for 300 mm before fairing back onto the guardrail line -- so the
    hoop leaves the legs wide and outboard of the deck edge, and has converged
    onto the line the stanchions are on by the time it reaches the anchor box.

    The nose is a semicircle on whatever width the rail line has left at
    `PULPIT_NOSE_STATION`, not a point. A point is a cusp, and a cusp swept as a
    tube turns itself inside out.
    """
    foot, nose = params.PULPIT_FOOT_STATION, params.PULPIT_NOSE_STATION
    top_station, _ = _pulpit_leg_top(foot, 1)
    fair = 0.300

    def splayed(station):
        held = max(0.0, (station - (top_station - fair)) / fair)
        return _rail_x(station) + params.PULPIT_LEG_SPLAY * min(1.0, held)

    plan = [(station, splayed(station)) for station in _stations(top_station, nose, 8)]

    radius = _rail_x(nose)
    for i in range(1, 6):
        angle = pi * i / 6
        plan.append((nose - radius * sin(angle), radius * cos(angle)))

    plan.extend(
        (station, -splayed(station)) for station in _stations(nose, top_station, 8)
    )
    return plan


def _build_pulpit(collection, foredeck):
    """The bow rail: a hoop from the deck, round the stemhead and back down, with
    a lower rail on the same plan and a short strut each side under it.

    Both rails are laid on the deck's own surface at the height they stand, so
    they lift with the foredeck as it sweeps up towards the stem -- 30 mm over
    the length of the pulpit, which is not much and is the difference between a
    rail that belongs to this boat and one that was drawn level and dropped on.
    """
    plan = _pulpit_plan()
    height = params.STANCHION_HEIGHT
    lower = height * params.LIFELINE_LOWER_FRACTION

    def at(station, x, lift):
        return (x, _y(station), foredeck(station, abs(x)) + lift)

    foot_station = params.PULPIT_FOOT_STATION
    foot_x = _rail_x(foot_station)

    def leg(side, lift):
        """A leg from its foot on deck to a height on the raked, splayed line."""
        top_station, top_x = _pulpit_leg_top(foot_station, side)
        t = lift / height
        return at(
            _lerp(foot_station, top_station, t),
            _lerp(side * foot_x, top_x, t),
            lift,
        )

    # Legs and top rail in one run, so the corner at the top of each leg is a
    # bend in a tube rather than a joint between two.
    top = [leg(1, 0.0), leg(1, height * 0.45)]
    top.extend(at(station, x, height) for (station, x) in plan)
    top.extend([leg(-1, height * 0.45), leg(-1, 0.0)])

    rail = [leg(1, lower)]
    rail.extend(at(station, x, lower) for (station, x) in plan)
    rail.append(leg(-1, lower))

    pieces = [
        _tube("pulpit_top", collection, _densify(top, 2), params.PULPIT_RADIUS),
        _tube("pulpit_rail", collection, _densify(rail, 2), params.PULPIT_RADIUS),
    ]

    strut_station = params.PULPIT_STRUT_STATION
    strut_x = _rail_x(strut_station)
    for side in (-1, 1):
        pieces.append(
            _tube(
                f"pulpit_strut_{side}",
                collection,
                [
                    at(strut_station, side * strut_x, 0.0),
                    at(strut_station, side * strut_x, lower),
                ],
                params.PULPIT_RADIUS,
            )
        )

    return join(pieces, "pulpit")


def _build_pulpit_block(collection, foredeck):
    """The teak pad at the apex of the pulpit.

    Where the anchor chain comes aboard, and the reason it exists: chain over
    stainless is a noise carried straight into the forepeak, which is where two
    people are asleep. Sat astride the top rail at the nose, wider than the tube
    so it reads as a block bolted round it rather than a lump in it.
    """
    length, width, thickness = params.PULPIT_BLOCK
    nose = params.PULPIT_NOSE_STATION
    radius = params.PULPIT_RADIUS

    station = nose - _rail_x(nose) + length / 2 - 0.010
    top = foredeck(station, 0.0) + params.STANCHION_HEIGHT + radius + thickness / 2

    return _loft_stack(
        "pulpit_block",
        collection,
        [
            (top - thickness / 2, _rounded_section(width, length, count=12, power=4.0)),
            (top, _rounded_section(width, length, count=12, power=4.0)),
        ],
        0.0,
        _y(station),
    )


def _build_stanchions(collection, foredeck):
    """The posts, each on a small base plate.

    The plate is 10 mm of nothing that does a lot: a tube meeting a deck at a
    line reads as a tube stuck through the deck, and the same tube standing on a
    disc reads as a fitting bolted to it.
    """
    posts = []
    for station in stanchion_stations():
        x = _rail_x(station)
        for side in (-1, 1):
            base = (side * x, _y(station), foredeck(station, x))
            top = (base[0], base[1], base[2] + params.STANCHION_HEIGHT)
            name = f"stanchion_{station:.2f}_{'p' if side < 0 else 's'}"

            posts.append(
                _tube(name, collection, [base, top], params.STANCHION_RADIUS)
            )
            posts.append(
                _tube(
                    name + "_base",
                    collection,
                    [base, (base[0], base[1], base[2] + 0.010)],
                    params.STANCHION_RADIUS * 1.9,
                )
            )

    return join(posts, "stanchions")


def _build_lifelines(collection, foredeck):
    """Two wires a side, from the pulpit through the top and the middle of each
    post.

    They stop at the after stanchion. There is no pushpit for them to reach, and
    a lifeline run on to a fitting that is not there was the one thing about this
    that could not be got from the deck itself.
    """
    height = params.STANCHION_HEIGHT
    posts = [params.PULPIT_FOOT_STATION, *stanchion_stations()]

    wires = []
    for index, lift in enumerate((height, height * params.LIFELINE_LOWER_FRACTION)):
        for side in (-1, 1):
            run = []
            for index, station in enumerate(posts):
                if index == 0:
                    # The pulpit end. Its leg rakes forward and splays out, so
                    # the wire lands where the leg is at that height rather than
                    # over the leg's foot.
                    t = lift / height
                    top_station, top_x = _pulpit_leg_top(station, side)
                    station = _lerp(station, top_station, t)
                    x = _lerp(side * _rail_x(params.PULPIT_FOOT_STATION), top_x, t)
                else:
                    x = side * _rail_x(station)
                run.append((x, _y(station), foredeck(station, abs(x)) + lift))

            wires.append(
                _tube(
                    f"lifeline_{index}_{'p' if side < 0 else 's'}",
                    collection,
                    _densify(run, 2),
                    params.STAY_DIAMETER / 2,
                    segments=6,
                )
            )

    return join(wires, "lifelines")


# --------------------------------------------------------------------------
# The outboard
# --------------------------------------------------------------------------


def _transom_station(z):
    """Where the transom face is at a height. It rakes, so it is a line and not
    a station -- the same 10 degrees the hull and the rudder are built on."""
    from math import radians, tan

    rake = tan(radians(params.TRANSOM_RAKE))
    return params.LOA - (params.FREEBOARD_STERN - z) * rake


def _build_outboard(collection):
    """Bracket, powerhead, leg, gearcase and propeller, hung to starboard.

    Six primitives, and the only one of them anybody will look at twice is the
    cowling -- which is why it is the only one with a section rather than
    corners. The rest is a leg going into the water, seen from the quarter, at
    two metres.
    """
    offset = params.OUTBOARD_OFFSET
    top = params.OUTBOARD_BRACKET_TOP
    length, width, cowl_height = params.OUTBOARD_COWLING

    transom_y = _y(_transom_station(top))
    mount_y = transom_y - 0.070
    shaft_y = mount_y - 0.055

    cowl_base = top + 0.045
    case_z = params.OUTBOARD_SHAFT_FOOT + 0.040
    case_nose = shaft_y + 0.095
    case_tail = shaft_y - 0.195

    parts = [
        _transom_pad(
            "outboard_bracket",
            collection,
            offset - 0.085,
            offset + 0.085,
            top - 0.150,
            top,
            0.070,
        ),
        _box(
            "outboard_clamp",
            collection,
            offset - 0.052,
            offset + 0.052,
            shaft_y - 0.045,
            mount_y,
            top - 0.030,
            cowl_base + 0.010,
        ),
        _loft_stack(
            "outboard_cowling",
            collection,
            [
                (cowl_base, _rounded_section(width * 0.92, length * 0.92)),
                (cowl_base + 0.030, _rounded_section(width, length)),
                (cowl_base + cowl_height - 0.055, _rounded_section(width, length)),
                (
                    cowl_base + cowl_height,
                    _rounded_section(width * 0.80, length * 0.78),
                ),
            ],
            offset,
            shaft_y - 0.030,
        ),
        _loft_stack(
            "outboard_leg",
            collection,
            [
                (z, _rounded_section(0.050, 0.130, count=10, power=2.4))
                for z in (cowl_base, cowl_base - 0.120, case_z + 0.070, case_z)
            ],
            offset,
            shaft_y,
        ),
        _build_gearcase(collection, offset, case_z, case_nose, case_tail),
        _box(
            "outboard_plate",
            collection,
            offset - 0.070,
            offset + 0.070,
            case_tail - 0.055,
            case_tail + 0.100,
            case_z + 0.042,
            case_z + 0.050,
        ),
    ]
    parts.extend(_build_propeller(collection, offset, case_tail, case_z))

    return join(parts, "outboard")


def _transom_pad(name, collection, x0, x1, z0, z1, depth):
    """A pad bolted to the transom: forward face on the rake, after face square.

    An axis-aligned box will not do here. The transom leans 10 degrees, so a
    150 mm pad built square against it touches at the bottom and stands 26 mm off
    at the top -- and that gap is on the boat's centreline-ish, at eye level from
    the quarter, with daylight behind it.
    """
    rings = []
    for z in (z1, z0):
        y = _y(_transom_station(z))
        rings.append(
            [(x0, y, z), (x1, y, z), (x1, y - depth, z), (x0, y - depth, z)]
        )

    obj = grid_to_mesh(name, rings, collection, close_rings=True)
    cap_loop(obj, rings[0])
    cap_loop(obj, list(reversed(rings[1])))
    return _finish(obj, sharp=30.0)


def _loft_stack(name, collection, levels, x, y):
    """Skin a stack of `(height, section)` levels centred on a point.

    Sections are given as `(athwartships, fore-and-aft)` pairs, which is how
    `_rounded_section` returns them and how an engine cover is described.
    """
    rings = [
        [(x + u, y + v, z) for (u, v) in section] for (z, section) in levels
    ]
    obj = grid_to_mesh(name, rings, collection, close_rings=True)
    cap_loop(obj, rings[0])
    cap_loop(obj, list(reversed(rings[-1])))
    return _finish(obj, sharp=40.0)


def _build_gearcase(collection, x, z, nose, tail):
    """The torpedo under the leg: pointed forward, cut off square at the hub."""
    radius = 0.040
    rings = []

    for i in range(9):
        t = i / 8
        # Fine at the nose, full over the middle, drawn in to meet the hub.
        if t < 0.28:
            r = radius * (t / 0.28) ** 0.55
        elif t > 0.86:
            r = radius * _lerp(1.0, 0.58, (t - 0.86) / 0.14)
        else:
            r = radius

        point_y = _lerp(nose, tail, t)
        rings.append(
            [
                (x + r * cos(2 * pi * j / 10), point_y, z + r * sin(2 * pi * j / 10))
                for j in range(10)
            ]
        )

    obj = grid_to_mesh("outboard_gearcase", rings, collection, close_rings=True)
    cap_loop(obj, rings[0])
    cap_loop(obj, list(reversed(rings[-1])))
    return _finish(obj, sharp=45.0)


def _build_propeller(collection, x, tail, z):
    """A hub and three blades.

    The blades are flat plates set at a pitch, which is a propeller the way the
    sail cover is a sail: wrong in every particular and right from anywhere the
    camera can get to. It is under water and 190 mm across.
    """
    hub_radius = 0.024

    rings = [
        [
            (
                x + hub_radius * cos(2 * pi * j / 10),
                y,
                z + hub_radius * sin(2 * pi * j / 10),
            )
            for j in range(10)
        ]
        for y in (tail + 0.005, tail - 0.030)
    ]
    hub = grid_to_mesh("outboard_hub", rings, collection, close_rings=True)
    cap_loop(hub, rings[0])
    cap_loop(hub, list(reversed(rings[-1])))
    parts = [_finish(hub, sharp=45.0)]

    tip = params.OUTBOARD_PROP_DIAMETER / 2
    pitch = 0.55  # radians off the plane of rotation
    hub_y = tail - 0.012

    for index in range(3):
        angle = 2 * pi * index / 3
        radial = (cos(angle), 0.0, sin(angle))
        chord = (-sin(angle) * cos(pitch), sin(pitch), cos(angle) * cos(pitch))
        normal = (
            chord[1] * radial[2] - chord[2] * radial[1],
            chord[2] * radial[0] - chord[0] * radial[2],
            chord[0] * radial[1] - chord[1] * radial[0],
        )

        blade = []
        for radius, half_chord in ((hub_radius * 0.8, 0.028), (tip, 0.020)):
            centre = (
                x + radial[0] * radius,
                hub_y + radial[1] * radius,
                z + radial[2] * radius,
            )
            blade.append(
                [
                    tuple(
                        centre[k] + chord[k] * half_chord * cu + normal[k] * 0.003 * nu
                        for k in range(3)
                    )
                    for (cu, nu) in ((1, 1), (1, -1), (-1, -1), (-1, 1))
                ]
            )

        obj = grid_to_mesh(f"prop_blade_{index}", blade, collection, close_rings=True)
        cap_loop(obj, blade[0])
        cap_loop(obj, list(reversed(blade[-1])))
        parts.append(_finish(obj, sharp=30.0))

    return parts

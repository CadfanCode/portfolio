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
import rig
import sails
from lib.mesh import bevel, cap_loop, grid_to_mesh, join, recalc_normals, shade_smooth
from lib.sweep import circle, sweep_rings


def build(collection):
    """Build the deck fittings. Returns a dict of named objects."""
    cockpit = deck.cockpit_surface_function()
    afterdeck = deck.aft_deck_function()
    foredeck = deck.surface_function()
    g = rig.layout(deck.height_function())

    parts = {
        "cockpit_grating": _build_grating(collection, cockpit),
        "cockpit_shelves": _build_cockpit_shelves(collection),
        "traveller": _build_traveller(collection, cockpit),
        "stern_rail": _build_stern_rail(collection, afterdeck),
        "winches": _build_winches(collection, afterdeck),
        "tiller": _build_tiller(collection),
        "pulpit": _build_pulpit(collection, foredeck),
        "stanchions": _build_stanchions(collection, foredeck),
        "lifelines": _build_lifelines(collection, foredeck),
        "outboard": _build_outboard(collection),
        "mast_clutches": _build_mast_clutches(collection, g),
        "mooring_cleats": _build_mooring_cleats(collection, foredeck, afterdeck),
        "boarding_ladder": _build_boarding_ladder(collection, afterdeck),
        "nav_lights": _build_nav_lights(collection, foredeck, afterdeck),
        "genoa_track": _build_genoa_track(collection),
        "sheets": _build_sheets(collection, cockpit, afterdeck, g),
    }
    # Removed at the owner's request: the outboard's portable fuel tank and its
    # line, the winch handle, the teak pulpit chafe block, and the bow anchor.
    # Their builders are kept below -- correct, and free unbuilt -- so restoring
    # any of them is a one-line entry in the dict above.

    # Every box, pad and moulded plate here gets its arris taken off -- see
    # `lib.mesh.bevel`. Swept tubes (rails, wires, rope) are left alone: they
    # are already round, and a bevel operator finds nothing sharper than its
    # own threshold on a cylinder to work on anyway.
    for name in (
        "traveller",
        "outboard",
        "mast_clutches",
        "mooring_cleats",
        "boarding_ladder",
        "nav_lights",
        "genoa_track",
    ):
        bevel(parts[name], width=0.003, segments=1)

    return parts


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


def _tube(name, collection, path, radius, segments=12):
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


def _build_cockpit_shelves(collection):
    """Two small semi-circular teak shelves on the coachroof's aft face, one
    either side of the companionway, at arm's length from the cockpit stop.

    A half-disc slab, flat edge to the face, half-round into the cockpit. It is
    built square against a vertical face and then sheared onto the real one, the
    same two-line trick `deck._build_companionway_frame` uses on the teak
    surround: the aft face of the coachroof leans forward, and a shear on y as a
    function of z lands the shelf flush on it without the shelf having to know
    the lean exists. Both edges of the slab -- the straight one on the face and
    the curved one over the well -- come off the same pair of half-disc loops, so
    the top, the bottom and the rim are one closed piece.

    Placed off the doorway, not off a station: the height is a fraction of the
    opening and the athwartships offset is measured from the teak surround's
    outer edge, so the pair moves with the companionway rather than drifting off
    it. Weathered `teak_exterior`, like the grating above and the tiller -- the
    only bare wood anywhere on the outside of the boat.
    """
    _, sill, head = deck.companionway_opening()
    z_mid = sill + (head - sill) * params.COCKPIT_SHELF_HEIGHT_FRACTION
    r = params.COCKPIT_SHELF_RADIUS
    half_t = params.COCKPIT_SHELF_THICKNESS / 2
    z0, z1 = z_mid - half_t, z_mid + half_t

    # Inboard edge of the shelf, out from the teak surround's outer edge.
    frame_outer = params.COMPANIONWAY_WIDTH / 2 + params.COMPANIONWAY_FRAME_WIDTH
    inner_x = frame_outer + params.COCKPIT_SHELF_FROM_FRAME

    station = params.COCKPIT_START
    # Stood off the face by `COCKPIT_SHELF_CLEARANCE`. Built on the face and
    # sheared onto it by the same call the face itself uses, the shelf's flat
    # back landed exactly in the plane of the `companionway` panel -- and two
    # surfaces in one plane are not flush, they are a coin toss taken per pixel.
    # What it looked like was the outline of a shelf printed through the wall,
    # from inside the cabin, which is the side of that panel a camera stop
    # points at.
    y_face = _y(station) - params.COCKPIT_SHELF_CLEARANCE
    count = 16

    shelves = []
    for side in (-1, 1):
        centre_x = side * (inner_x + r)

        def half_disc(z):
            # The straight diameter lies on the face (y = y_face); the arc bulges
            # aft into the cockpit (decreasing y). `close_rings` later shuts the
            # loop back along the diameter, which is the edge against the wall.
            ring = []
            for i in range(count + 1):
                theta = pi * i / count
                ring.append(
                    (centre_x + r * cos(theta), y_face - r * sin(theta), z)
                )
            return ring

        top, bottom = half_disc(z1), half_disc(z0)
        obj = grid_to_mesh(
            f"cockpit_shelf_{side}", [top, bottom], collection, close_rings=True
        )
        cap_loop(obj, top)
        cap_loop(obj, list(reversed(bottom)))

        # Onto the leaning face, the same shear the frame and doorway carry.
        for vertex in obj.data.vertices:
            vertex.co.y += deck.companionway_lean(station, vertex.co.z)

        bevel(obj, width=0.004, segments=1)

        # Then flatten the back onto the standoff plane, because a shelf glued
        # to a wall has a flat back and the bevel above does not leave one. At
        # the two corners where the arc meets the diameter three edges meet, and
        # mitring them throws a vertex out along the bisector -- which at those
        # corners points forward, a full bevel width proud of the face. That is
        # twice `COCKPIT_SHELF_CLEARANCE` and straight through the panel: the
        # standoff on its own moved the shelf back and left two spikes in the
        # cabin. Clamped rather than made smaller, so the arris stays the size
        # the rest of the boat's woodwork wears.
        for vertex in obj.data.vertices:
            face = _y(station) + deck.companionway_lean(station, vertex.co.z)
            vertex.co.y = min(vertex.co.y, face - params.COCKPIT_SHELF_CLEARANCE)

        shelves.append(_finish(obj, sharp=35.0))

    return join(shelves, "cockpit_shelves")


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
            # 16 sides, not 12: the winch is a hero of the cockpit stop, its
            # waist catches a bright ring of highlight, and at 80 mm across a
            # 12-gon steps that highlight visibly. The drums are four small
            # objects, so the rounder barrel is cheap.
            sides = 16
            rings = [
                [
                    (
                        x + radius * cos(2 * pi * i / sides),
                        _y(station) + radius * sin(2 * pi * i / sides),
                        foot + lift,
                    )
                    for i in range(sides)
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
    """The teak chafe pad at the stemhead, inside the pulpit.

    Where the anchor chain comes aboard, and the reason it exists: chain over
    stainless is a noise carried straight into the forepeak, which is where two
    people are asleep.

    It sat astride the pulpit's top rail to begin with, half a metre up in the
    air at the nose, which is where the rail is but not where the chain runs and
    not where the eye expects a wooden block -- it read as floating. A chafe pad
    lives on the deck, under the roller, taking the chain where it actually lands
    when it comes in over the stemhead. So it is bedded on the foredeck now, just
    proud of it, at the same nose station as before.
    """
    length, width, thickness = params.PULPIT_BLOCK
    nose = params.PULPIT_NOSE_STATION

    station = nose - _rail_x(nose) + length / 2 - 0.010
    top = foredeck(station, 0.0) + 0.006 + thickness

    return _loft_stack(
        "pulpit_block",
        collection,
        [
            (top - thickness, _rounded_section(width, length, count=12, power=4.0)),
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


def outboard_cowl_base():
    """The height at which the cowling sits down onto the leg.

    Public because `materials` splits the motor's single mesh into cowling and
    leg at this plane. A materials module carrying its own number for it would
    put the paint line somewhere that stopped being a seam the first time the
    motor was re-proportioned, which is the same argument that keeps every
    fitting in this module asking the deck where it is.
    """
    return _outboard_layout()["cowl_base"]


def _outboard_layout():
    """Every point the outboard and its fuel line hang from, computed once.

    Public within this module for the reason `rig.layout` is public across
    modules: the fuel line has to end exactly where the powerhead is, and a
    second copy of this arithmetic is a copy that drifts from the first the
    next time an `OUTBOARD_*` number moves.
    """
    offset = params.OUTBOARD_OFFSET
    top = params.OUTBOARD_BRACKET_TOP
    length, width, cowl_height = params.OUTBOARD_COWLING

    transom_y = _y(_transom_station(top))
    # 120 mm off the transom, not 70. At 70 the clamp and the forward face of
    # the cowling sat right on the transom moulding -- the powerhead's forward
    # corner was level with its inner face, so from the cockpit the motor read
    # as growing out of the aft coaming. A real outboard hangs on a bracket that
    # stands it well clear of the transom; standing it off here moves the whole
    # assembly aft of the boat, where it belongs, and the bracket pad below is
    # lengthened to bridge the gap.
    bracket_standoff = 0.120
    mount_y = transom_y - bracket_standoff
    shaft_y = mount_y - 0.055

    cowl_base = top + 0.045
    case_z = params.OUTBOARD_SHAFT_FOOT + 0.040

    return {
        "offset": offset,
        "top": top,
        "length": length,
        "width": width,
        "cowl_height": cowl_height,
        "transom_y": transom_y,
        "mount_y": mount_y,
        "shaft_y": shaft_y,
        "bracket_standoff": bracket_standoff,
        "cowl_base": cowl_base,
        "case_z": case_z,
        "case_nose": shaft_y + 0.095,
        "case_tail": shaft_y - 0.195,
    }


def _build_outboard(collection):
    """Bracket, clamp, cowling, tiller arm, leg, gearcase and propeller, hung
    to starboard on a transom bracket.

    A real long-shaft two-stroke, at the level of detail the quarter view
    actually resolves: a moulded cowling with a parting line and vents, a
    carry handle and a pull-start on top of it, the steering/throttle arm
    folded back with its twist grip, the leg with its anti-cavitation plate
    and skeg, the three-bladed prop, and the transom clamp with the two screw
    handles and the pin it tilts on.

    Nothing here moves the propeller, the gearcase or the clamp box from
    where the previous, cruder version put them -- `verify.py`'s propeller and
    rudder-clearance checks read the same points either way, and both of them
    are the reason this geometry is not free (see `OUTBOARD_OFFSET`'s note).
    """
    o = _outboard_layout()

    parts = [
        _transom_pad(
            "outboard_bracket",
            collection,
            o["offset"] - 0.085,
            o["offset"] + 0.085,
            o["top"] - 0.150,
            o["top"],
            o["bracket_standoff"],
        ),
        _box(
            "outboard_clamp",
            collection,
            o["offset"] - 0.052,
            o["offset"] + 0.052,
            o["shaft_y"] - 0.045,
            o["mount_y"],
            o["top"] - 0.030,
            o["cowl_base"] + 0.010,
        ),
        _build_clamp_screws(collection, o),
        _build_tilt_pivot(collection, o),
        _build_cowling(collection, o),
        _build_tiller_arm(collection, o),
        _loft_stack(
            "outboard_leg",
            collection,
            [
                (z, _rounded_section(0.050, 0.130, count=10, power=2.4))
                for z in (
                    o["cowl_base"],
                    o["cowl_base"] - 0.120,
                    o["case_z"] + 0.070,
                    o["case_z"],
                )
            ],
            o["offset"],
            o["shaft_y"],
        ),
        _build_gearcase(collection, o["offset"], o["case_z"], o["case_nose"], o["case_tail"]),
        # The anti-cavitation plate: the flat wing just above the prop that
        # keeps aerated surface water off the blades. It was already here,
        # under a name that did not say so.
        _box(
            "outboard_anticavitation_plate",
            collection,
            o["offset"] - 0.070,
            o["offset"] + 0.070,
            o["case_tail"] - 0.055,
            o["case_tail"] + 0.100,
            o["case_z"] + 0.042,
            o["case_z"] + 0.050,
        ),
        _build_skeg(collection, o),
    ]
    parts.extend(_build_propeller(collection, o["offset"], o["case_tail"], o["case_z"]))

    return join(parts, "outboard")


def _build_clamp_screws(collection, o):
    """The two screw handles that clamp the bracket to the transom -- the only
    part of the mount that turns, and the part that says "transom bracket"
    rather than "welded on"."""
    z = o["top"] - 0.010
    parts = []
    for side in (-1, 1):
        x = o["offset"] + side * 0.058
        parts.append(
            _tube(
                f"outboard_clamp_screw_{side}",
                collection,
                [(x, o["mount_y"] - 0.006, z), (x, o["mount_y"] + 0.045, z)],
                0.007,
            )
        )
        parts.append(
            _tube(
                f"outboard_clamp_handle_{side}",
                collection,
                [(x - 0.032, o["mount_y"] + 0.045, z), (x + 0.032, o["mount_y"] + 0.045, z)],
                0.008,
            )
        )
    return join(parts, "outboard_clamp_screws")


def _build_tilt_pivot(collection, o):
    """The pin the leg assembly tilts up on, clear of the water when the
    motor is not running."""
    x0 = o["offset"] - 0.062
    x1 = o["offset"] + 0.062
    y = o["mount_y"] - 0.010
    z = o["top"] - 0.095
    return _tube("outboard_tilt_pivot", collection, [(x0, y, z), (x1, y, z)], 0.008)


def _build_cowling(collection, o):
    """The engine cover: a moulded shell with a horizontal parting line, low
    side vents, a carry handle across the top and the pull-start's boss under
    it.

    The parting line is a real step in the loft rather than a decal -- two
    rings a few millimetres apart with the outer one very slightly larger,
    which is what the seam between a moulded top and bottom half actually
    looks like from a few metres off.
    """
    x, y = o["offset"], o["shaft_y"] - 0.030
    base, height = o["cowl_base"], o["cowl_height"]
    length, width = o["length"], o["width"]
    seam = base + height * 0.40

    shell = _loft_stack(
        "outboard_cowling",
        collection,
        [
            (base, _rounded_section(width * 0.92, length * 0.92)),
            (base + 0.030, _rounded_section(width, length)),
            (seam - 0.006, _rounded_section(width * 1.010, length * 1.010)),
            (seam, _rounded_section(width * 0.985, length * 0.985)),
            (base + height - 0.055, _rounded_section(width, length)),
            (base + height, _rounded_section(width * 0.80, length * 0.78)),
        ],
        x,
        y,
    )

    parts = [shell]

    # Vents: three low ribs a side, aft of the parting line and clear of the
    # handle -- roughly where a two-stroke's cowling actually breathes.
    for side in (-1, 1):
        vx = x + side * width * 0.485
        for i in range(3):
            vz = base + 0.050 + i * 0.026
            parts.append(
                _box(
                    f"outboard_vent_{side}_{i}",
                    collection,
                    vx - 0.004,
                    vx + 0.004,
                    y - length * 0.20,
                    y + length * 0.20,
                    vz,
                    vz + 0.009,
                )
            )

    # Carry handle: a bail across the top, ahead of the pull-start.
    handle_z = base + height
    parts.append(
        _tube(
            "outboard_handle",
            collection,
            _densify(
                [
                    (x - 0.006, y + length * 0.14, handle_z),
                    (x - 0.058, y + length * 0.14, handle_z + 0.036),
                    (x - 0.058, y - length * 0.08, handle_z + 0.036),
                    (x - 0.006, y - length * 0.08, handle_z),
                ],
                per_segment=3,
            ),
            0.007,
            segments=8,
        )
    )

    # Pull-start: the recoil housing's boss, aft of the handle.
    parts.append(
        _loft_stack(
            "outboard_pullstart",
            collection,
            [
                (handle_z - 0.006, circle(0.038, 14)),
                (handle_z + 0.008, circle(0.034, 14)),
            ],
            x + 0.028,
            y - length * 0.20,
        )
    )

    return join(parts, "outboard_cowling")


def _build_tiller_arm(collection, o):
    """The steering/throttle arm, folded aft and outboard against the cowling
    with its twist grip -- how a small outboard is left when nobody is
    steering it.

    Folded outboard, away from the centreline, rather than inboard towards
    it: the rudder is on the centreline and `verify.py` checks this motor
    clear of it (`outboard clear of the rudder`) -- an arm that swung the
    other way to reach a helmsman would cross the blade it is checked
    against.
    """
    x, y = o["offset"], o["shaft_y"]
    mount = (x - 0.055, y + 0.030, o["cowl_base"] + o["cowl_height"] * 0.55)
    elbow = (x + 0.075, y - 0.145, mount[2] - 0.010)
    grip_start = (x + 0.155, y - 0.260, mount[2] - 0.020)
    grip_end = (grip_start[0] + 0.010, grip_start[1] - 0.075, grip_start[2] - 0.006)

    arm = _tube(
        "outboard_tiller_arm",
        collection,
        _densify([mount, elbow, grip_start], per_segment=4),
        0.009,
        segments=8,
    )
    grip = _tube(
        "outboard_tiller_grip", collection, [grip_start, grip_end], 0.017, segments=10
    )
    return join([arm, grip], "outboard_tiller")


def _build_skeg(collection, o):
    """A small fin below the gearcase, aft of the prop -- what takes a
    grounding first on a boat this size, rather than the blades.

    Kept shallower than the propeller's own lowest point on purpose:
    `verify.py`'s "whole propeller below the waterline" check takes the
    built outboard's minimum z and adds the prop's diameter back to find the
    top of the disc, which only means what it says if the propeller really is
    the deepest thing on the model. A skeg that reached past it would read
    fine and quietly break what the check is measuring.
    """
    tail = o["case_tail"] - 0.010
    nose = o["case_tail"] + 0.075
    return _loft_stack(
        "outboard_skeg",
        collection,
        [
            (o["case_z"] - 0.005, _rounded_section(0.026, nose - tail, count=8, power=3.0)),
            (
                o["case_z"] - 0.070,
                _rounded_section(0.014, (nose - tail) * 0.55, count=8, power=3.0),
            ),
        ],
        o["offset"],
        (nose + tail) / 2,
    )


def _build_outboard_fuel(collection, cockpit):
    """A portable fuel tank on the cockpit sole and the line running from it
    up over the coaming to the outboard.

    The brochure stows both motor and tank in the side lockers
    (`COCKPIT_LOCKER_START`/`END`'s note), which is where they belong on a
    passage. This boat is shown with its sails already drawing and about to
    get under way, which is exactly when the tank is out on the sole and
    connected rather than shut away.
    """
    o = _outboard_layout()

    tank_station = params.COCKPIT_END - 0.220
    footwell, seat, _ = deck.cockpit_widths(tank_station)
    tank_x = min(o["offset"] * 0.55, (footwell + seat) / 2)

    length, width, height = 0.220, 0.150, 0.130
    base = cockpit(tank_station, tank_x)
    tank = _loft_stack(
        "outboard_tank",
        collection,
        [
            (base, _rounded_section(width, length, count=10, power=3.0)),
            (base + height * 0.94, _rounded_section(width, length, count=10, power=3.0)),
            (
                base + height,
                _rounded_section(width * 0.55, length * 0.5, count=10, power=3.0),
            ),
        ],
        tank_x,
        _y(tank_station),
    )

    coaming_station = params.COCKPIT_END - 0.020
    coaming_top = cockpit(coaming_station, tank_x) + 0.220
    outboard_point = (
        o["offset"] - 0.055,
        o["mount_y"] + 0.055,
        o["top"] + o["cowl_height"] * 0.25,
    )

    hose = _tube(
        "outboard_fuel_line",
        collection,
        _densify(
            [
                (tank_x + width * 0.20, _y(tank_station), base + height * 0.80),
                (tank_x + 0.140, _y(coaming_station), coaming_top),
                outboard_point,
            ],
            per_segment=4,
        ),
        0.0055,
        segments=6,
    )

    return join([tank, hose], "outboard_fuel")


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


# --------------------------------------------------------------------------
# The mast foot: halyard clutches
# --------------------------------------------------------------------------


def _build_mast_clutches(collection, g):
    """A bank of two halyard clutches just abaft the mast -- where the main
    and genoa halyards in `rig.py`'s running rigging actually end.

    Simple wedge-topped boxes rather than the real hardware's cam-and-lever:
    what reads from the cockpit is the bank of them on the coachroof, not the
    mechanism, and `rig._build_running_rigging` already reads the same
    `g["clutch_station"]`/`g["clutch_half_beam"]` this does, so the ropes end
    exactly here whatever those two numbers are.
    """
    station = g["clutch_station"]
    half = g["clutch_half_beam"]
    z = g["clutch_z"]

    boxes = []
    for side in (-1, 1):
        x = side * half
        boxes.append(
            _box(
                f"mast_clutch_{side}",
                collection,
                x - 0.028,
                x + 0.028,
                _y(station) - 0.042,
                _y(station) + 0.042,
                z,
                z + 0.032,
            )
        )
    return join(boxes, "mast_clutches")


# --------------------------------------------------------------------------
# Winch handle and its pocket
# --------------------------------------------------------------------------


def _build_winch_handle(collection, afterdeck):
    """A winch handle, stowed in a pocket beside the after winch rather than
    left in the winch it turns.

    One only, and on the port after winch -- a handle left in a self-tailing
    winch is the first thing to go over the side when the boom comes across,
    and a pocket on the coaming is where it actually lives between tacks.
    """
    station = params.COCKPIT_WINCH_STATIONS[-1]
    side = -1
    centre = winch_centre(station)
    x = side * (centre + params.COCKPIT_WINCH_BASE + 0.026)
    z = afterdeck(station, abs(x))

    pocket = _box(
        "winch_handle_pocket",
        collection,
        x - 0.016,
        x + 0.016,
        _y(station) - 0.080,
        _y(station) + 0.010,
        z,
        z + 0.048,
    )
    shaft = _tube(
        "winch_handle_shaft",
        collection,
        [
            (x, _y(station) - 0.065, z + 0.026),
            (x, _y(station) + 0.175, z + 0.026),
        ],
        0.008,
        segments=8,
    )
    grip = _tube(
        "winch_handle_grip",
        collection,
        [
            (x, _y(station) + 0.175, z + 0.026),
            (x, _y(station) + 0.175, z + 0.058),
        ],
        0.011,
        segments=8,
    )
    return join([pocket, shaft, grip], "winch_handle")


# --------------------------------------------------------------------------
# Mooring cleats
# --------------------------------------------------------------------------

CLEAT_LENGTH = 0.110
CLEAT_BASE = 0.026
CLEAT_HEIGHT = 0.038
"""A simple two-horn cleat: a low base with a horn rising at each end.
FITTED -- the proportions of a small cast cleat for a boat this size, not any
specific catalogue part."""


def _cleat(collection, name, x, station, z, athwart=False):
    """One mooring cleat.

    Its horns lie fore-and-aft along the deck by default, which is how a cleat
    on the side deck takes a mooring line's load along the deck edge. With
    `athwart` set they run across the boat instead: that is how the stern pair
    is bedded, so a stern line leads cleanly aft over the transom corner rather
    than having to turn across its own horns to get there.
    """
    y = _y(station)
    half_len = CLEAT_LENGTH / 2
    half_base = CLEAT_BASE / 2

    if athwart:
        x0, x1, y0, y1 = x - half_len, x + half_len, y - half_base, y + half_base
    else:
        x0, x1, y0, y1 = x - half_base, x + half_base, y - half_len, y + half_len
    base = _box(f"{name}_base", collection, x0, x1, y0, y1, z, z + 0.008)

    horns = []
    for sign in (-1, 1):
        # The horn steps up off the base and hooks back down over the end of the
        # cleat's long axis -- along y for a fore-and-aft cleat, along x for an
        # athwartships one.
        if athwart:
            hx = x + sign * half_len * 0.7
            path = [
                (hx, y, z + 0.008),
                (hx, y, z + CLEAT_HEIGHT),
                (hx - sign * 0.026, y, z + CLEAT_HEIGHT - 0.006),
            ]
        else:
            hy = y + sign * half_len * 0.7
            path = [
                (x, hy, z + 0.008),
                (x, hy, z + CLEAT_HEIGHT),
                (x, hy - sign * 0.026, z + CLEAT_HEIGHT - 0.006),
            ]
        horns.append(
            _tube(
                f"{name}_horn_{sign}",
                collection,
                _densify(path, per_segment=3),
                0.009,
                segments=8,
            )
        )
    return join([base] + horns, name)


def _build_mooring_cleats(collection, foredeck, afterdeck):
    """Two pairs: one on the foredeck abaft the pulpit legs, one on the after
    deck either side of the stern rail's return -- where a boat this size is
    actually made fast from, bow and stern."""
    fwd_station = params.PULPIT_FOOT_STATION + 0.300
    aft_station = params.COCKPIT_END + 0.170

    cleats = []
    for side in (-1, 1):
        x = side * (deck.deck_edge_half_width(fwd_station) - 0.075)
        z = foredeck(fwd_station, abs(x))
        cleats.append(_cleat(collection, f"cleat_fwd_{side}", x, fwd_station, z))

    for side in (-1, 1):
        x = side * (deck.deck_edge_half_width(aft_station) - 0.075)
        z = afterdeck(aft_station, abs(x))
        cleats.append(
            _cleat(collection, f"cleat_aft_{side}", x, aft_station, z, athwart=True)
        )

    return join(cleats, "mooring_cleats")


# --------------------------------------------------------------------------
# The anchor
# --------------------------------------------------------------------------


def _build_anchor(collection, foredeck):
    """A plow anchor stowed at the bow, shackled to a short length of chain
    that leads back into the anchor box -- what `PULPIT_BLOCK`'s teak pad is
    there to take the noise of (see its note in `params.py`).

    A plow rather than a fisherman or a Danforth: it is the shape that stows
    against a bow roller without being lashed down, which is the only kind of
    anchor a flush foredeck with nothing to trip over (`ANCHORBOX_LID_PROUD`'s
    own boast) would actually carry loose.
    """
    nose = params.PULPIT_NOSE_STATION
    station = nose - 0.060
    z = foredeck(station, 0.0) + params.STANCHION_HEIGHT * 0.35

    shank = _tube(
        "anchor_shank",
        collection,
        [(0.0, _y(station), z + 0.060), (0.0, _y(station - 0.050), z - 0.010)],
        0.010,
    )
    blade = _loft_stack(
        "anchor_blade",
        collection,
        [
            (z - 0.045, _rounded_section(0.075, 0.140, count=10, power=2.2)),
            (z - 0.010, _rounded_section(0.100, 0.195, count=10, power=2.2)),
        ],
        0.0,
        _y(station - 0.050),
    )
    chain = _tube(
        "anchor_chain",
        collection,
        _densify(
            [
                (0.0, _y(station), z + 0.060),
                (0.0, _y(station + 0.090), z + 0.030),
                (0.0, _y(station + 0.150), foredeck(station + 0.150, 0.0) + 0.010),
            ],
            per_segment=3,
        ),
        0.006,
        segments=6,
    )

    return join([shank, blade, chain], "anchor")


# --------------------------------------------------------------------------
# Boarding ladder and nav lights
# --------------------------------------------------------------------------


def _build_boarding_ladder(collection, afterdeck):
    """A folding boarding ladder hooked over the pushpit, port quarter --
    clear of the outboard, which has the starboard quarter to itself."""
    station = params.COCKPIT_END + 0.060
    x = -params.STERN_RAIL_LEG_HALF_BEAM * 0.85
    hook_z = afterdeck(station, abs(x)) + params.STERN_RAIL_STAND

    rails = []
    for side in (-1, 1):
        rx = x + side * 0.014
        rails.append(
            _tube(
                f"ladder_rail_{side}",
                collection,
                _densify(
                    [
                        (rx, _y(station), hook_z),
                        (rx, _y(station) + 0.060, hook_z + 0.018),
                        (rx, _y(station) + 0.060, hook_z - 0.420),
                    ],
                    per_segment=3,
                ),
                0.008,
                segments=6,
            )
        )

    rungs = [
        _tube(
            f"ladder_rung_{i}",
            collection,
            [
                (x - 0.014, _y(station) + 0.060, hook_z - 0.130 - i * 0.120),
                (x + 0.014, _y(station) + 0.060, hook_z - 0.130 - i * 0.120),
            ],
            0.007,
            segments=6,
        )
        for i in range(3)
    ]

    return join(rails + rungs, "boarding_ladder")


def _build_nav_lights(collection, foredeck, afterdeck):
    """Port and starboard sidelights at the pulpit, a white light at the
    stern -- simple lensed boxes, cheap enough that leaving them off would be
    the more noticeable choice."""
    station = params.PULPIT_FOOT_STATION - 0.100
    lights = []
    for side, name in ((-1, "port"), (1, "starboard")):
        x = side * (deck.deck_edge_half_width(station) - 0.030)
        z = foredeck(station, abs(x)) + 0.060
        lights.append(
            _box(
                f"navlight_{name}",
                collection,
                x - 0.018,
                x + 0.018,
                _y(station) - 0.022,
                _y(station) + 0.022,
                z,
                z + 0.030,
            )
        )

    stern_station = params.COCKPIT_END + 0.010
    z = afterdeck(stern_station, 0.0) + params.STERN_RAIL_STAND + 0.015
    lights.append(
        _box(
            "navlight_stern",
            collection,
            -0.018,
            0.018,
            _y(stern_station) - 0.010,
            _y(stern_station) + 0.022,
            z,
            z + 0.028,
        )
    )

    return join(lights, "nav_lights")


# --------------------------------------------------------------------------
# The genoa track
# --------------------------------------------------------------------------

GENOA_TRACK_STATION = 3.900
GENOA_TRACK_LENGTH = 0.500
GENOA_CAR_POSITION = 0.55
"""A track on each side deck, centred between the coachroof and the deck edge
-- the strip that has no business belonging to either.

The station was 4.900, which put the track's after end level with the forward
end of the cockpit, where the side deck has given out and the rail was left
cantilevered over the footwell. Moved a metre forward to 3.900, where it sits
on side deck for its whole length, which is also where a genoa track belongs:
the lead has to be forward of the clew, and the clew of a working genoa is well
forward of the cockpit.

Both tracks are built, port and starboard, because a boat has one each side and
the far one is in shot whenever the near one is. Each carries a single car, at
the position this sail is trimmed to in this scene rather than a fully
adjustable range -- the brief is a working sheet lead, not a catalogue of every
hole in the track. Only the leeward car does any work: the genoa is sheeted to
leeward, which `params.LEEWARD_SIGN` puts to starboard now."""


def genoa_car_x(station):
    """Where a genoa track sits on the side deck: centred between the
    coachroof and the deck edge, the same way `winch_centre` finds the middle
    of whatever side deck the cockpit has."""
    return (deck.coachroof_half_width(station) + deck.deck_edge_half_width(station)) / 2


def genoa_car_point():
    """Where the sheet leaves the car, in world space -- the leeward side, since
    the genoa is sheeted to leeward (`params.LEEWARD_SIGN`, to starboard now;
    see `params.GENOA_CLEW_OFFSET`'s note)."""
    car_station = (
        GENOA_TRACK_STATION - GENOA_TRACK_LENGTH / 2 + GENOA_TRACK_LENGTH * GENOA_CAR_POSITION
    )
    x = params.LEEWARD_SIGN * genoa_car_x(car_station)
    z = deck.surface_function()(car_station, abs(x)) + 0.028
    return (x, _y(car_station), z)


def _build_genoa_track(collection):
    """A short track and car on each side deck, where the genoa sheet leads aft
    to the winch. Port and starboard are identical bar the sign of `x`; only the
    leeward car is loaded, but both are built -- see `GENOA_CAR_POSITION`'s note."""
    start = GENOA_TRACK_STATION - GENOA_TRACK_LENGTH / 2
    end = GENOA_TRACK_STATION + GENOA_TRACK_LENGTH / 2
    surface = deck.surface_function()

    car_station = (
        GENOA_TRACK_STATION - GENOA_TRACK_LENGTH / 2 + GENOA_TRACK_LENGTH * GENOA_CAR_POSITION
    )
    pieces = []
    for side in (-1, 1):
        x = side * genoa_car_x(GENOA_TRACK_STATION)
        z = surface(GENOA_TRACK_STATION, abs(x))
        pieces.append(
            _box(
                f"genoa_track_rail_{side}",
                collection,
                x - 0.012,
                x + 0.012,
                _y(end),
                _y(start),
                z,
                z + 0.010,
            )
        )
        car_x = side * genoa_car_x(car_station)
        car_z = surface(car_station, abs(car_x))
        pieces.append(
            _box(
                f"genoa_car_{side}",
                collection,
                car_x - 0.022,
                car_x + 0.022,
                _y(car_station) - 0.026,
                _y(car_station) + 0.026,
                car_z + 0.008,
                car_z + 0.030,
            )
        )
    return join(pieces, "genoa_track")


# --------------------------------------------------------------------------
# Sheets: rope handled from the cockpit
#
# The standing rigging and the halyards are `rig.py`'s, because both ends of
# them answer to the mast. Sheets are built here instead, because both ends
# of *these* are cockpit hardware -- the traveller and the winches -- and a
# rope is easiest to get right from the same module as the fittings it is
# reeved through.
# --------------------------------------------------------------------------


def _rope(name, collection, path, radius=0.007, segments=8):
    """A length of sheet: a tube, fatter than a halyard because it is handled
    under load rather than just hoisted and cleated."""
    rings = sweep_rings(circle(radius, segments), _densify(path, per_segment=4))
    obj = grid_to_mesh(name, rings, collection, close_rings=True)
    cap_loop(obj, rings[0])
    cap_loop(obj, list(reversed(rings[-1])))
    return _finish(obj, sharp=60.0)


def _flat_coil(collection, name, centre, z, radius, turns, tube_radius=0.0055):
    """A coil of rope flemished flat on deck: a tightening spiral in the
    horizontal plane, all of it at the one height above whatever the deck is
    doing there -- the same cheap trick as `rig.py`'s hanging coils, laid down
    instead of hung up."""
    steps_per_turn = 14
    total = int(round(turns * steps_per_turn))
    path = []
    for i in range(total + 1):
        t = i / steps_per_turn
        angle = 2 * pi * t
        r = radius * (1.0 - 0.82 * t / turns)
        path.append((centre[0] + r * cos(angle), centre[1] + r * sin(angle), z))
    rings = sweep_rings(circle(tube_radius, 8), path)
    obj = grid_to_mesh(name, rings, collection, close_rings=True)
    return _finish(obj, sharp=60.0)


def _build_mainsheet(collection, cockpit, g):
    """Boom to the traveller car, car to a cleat on the bridgedeck step, and
    the tail flemished down beside it -- taut throughout, since the boat is
    shown eased on a beam reach and drawing rather than at rest. The boom_bail
    rides the swung boom (`rig.boom_point`), and the car is dropped to leeward,
    which is where it sits when the mainsheet is eased off the wind."""
    boom_bail = rig.boom_point(g, 0.90)
    boom_bail = (boom_bail[0], boom_bail[1], boom_bail[2] - 0.030)

    station = params.TRAVELLER_STATION
    bar_z = cockpit(station, 0.0) + params.TRAVELLER_STAND
    car_x = params.LEEWARD_SIGN * 0.6 * params.TRAVELLER_HALF_WIDTH
    car = (car_x, _y(station), bar_z + 0.020)

    cleat_station = station + 0.060
    cleat = (0.055, _y(cleat_station), cockpit(cleat_station, 0.055) + 0.030)

    sheet = _rope("mainsheet", collection, [boom_bail, car, cleat])
    coil = _flat_coil(
        collection,
        "mainsheet_coil",
        (cleat[0] + 0.032, cleat[1] - 0.010),
        cleat[2],
        0.075,
        2.6,
    )
    return join([sheet, coil], "mainsheet")


def _build_genoa_sheet(collection, afterdeck, g):
    """Clew to the leeward genoa car, car aft to the leeward after winch, and the
    tail flemished on the cockpit sole beside it. Which side is `LEEWARD_SIGN`,
    so the whole lead follows the sail onto the tack rather than crossing the
    boat to a windward winch."""
    clew = sails.genoa_clew(g)
    car = genoa_car_point()

    winch_station = params.COCKPIT_WINCH_STATIONS[0]
    winch_x = params.LEEWARD_SIGN * winch_centre(winch_station)
    winch_top = (
        winch_x,
        _y(winch_station),
        afterdeck(winch_station, abs(winch_x)) + params.COCKPIT_WINCH_HEIGHT,
    )

    sheet = _rope("genoa_sheet", collection, [clew, car, winch_top])
    coil = _flat_coil(
        collection,
        "genoa_sheet_coil",
        (winch_x + params.LEEWARD_SIGN * 0.105, winch_top[1] - 0.120),
        winch_top[2] - 0.095,
        0.085,
        2.8,
    )
    return join([sheet, coil], "genoa_sheet")


def _build_sheets(collection, cockpit, afterdeck, g):
    """The mainsheet and the genoa sheet, joined under one name for the
    handoff -- both are the same material, and both are rope for the same
    reason."""
    return join(
        [
            _build_mainsheet(collection, cockpit, g),
            _build_genoa_sheet(collection, afterdeck, g),
        ],
        "sheets",
    )

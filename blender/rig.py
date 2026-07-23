"""
The masthead rig: mast, boom, spreaders and standing rigging.

Almost none of this is fitted. The class rules dimension a rig tightly, because
it is what a one-design fleet argues about, so the geometry here is mostly
bookkeeping against rules C.6.1 and F.2-F.5 -- where the mast stands, how far
above the sheer the bands sit, how long the boom is, how short the spreaders may
not be. The two things the rules leave open are the overall mast height, which
comes from the published foretriangle height, and where the chainplates land,
which the spreader length very nearly determines on its own.

Two useful consistency checks fall out rather than being arranged:

    The forestay lands at station 115 -- the mast is 3450 aft of the stem and
    the foretriangle base is 3335, so the difference puts it within a hand's
    width of the stemhead, which is where a masthead rig's stemhead fitting is.

    The boom sits 1360 above the sheer, which is 1.4 m above the cockpit seats.
    The brochure sells exactly that: "Genom att bommen sitter en bit upp pa
    masten far du en ordentligt fri hojd i sittbrunnen."
"""

from math import cos, hypot, pi, sin

import params
from lib.curves import Curve
from lib.mesh import bevel, cap_loop, grid_to_mesh, join, recalc_normals, shade_smooth
from lib.sweep import circle, ellipse, sweep_rings


def build(collection, deck_height):
    """Build the rig.

    `deck_height(station, x)` returns the height of whatever the deck moulding
    has at that point -- foredeck, coachroof, side deck or after deck -- so the
    mast heel and every stay foot land on the structure rather than floating
    above it or sinking through it. The half-offset is not optional detail: the
    chainplates are 950 mm off the centreline and the deck out there is a good
    deal lower than the coachroof on it.
    """
    geometry = layout(deck_height)
    parts = {}

    parts["mast"] = _build_mast(collection, geometry)
    parts["boom"] = _build_boom(collection, geometry)
    parts["spreaders"] = _build_spreaders(collection, geometry)
    parts["rigging"] = _build_rigging(collection, geometry)
    parts["gooseneck"] = _build_gooseneck(collection, geometry)
    parts["spreader_boots"] = _build_spreader_boots(collection, geometry)
    parts["masthead_unit"] = _build_masthead_unit(collection, geometry)
    parts["running_rigging"] = _build_running_rigging(collection, geometry)

    if params.SAIL_COVER:
        parts["sailcover"] = _build_sail_cover(collection, geometry)

    for name in ("mast", "boom", "spreaders", "gooseneck", "masthead_unit"):
        bevel(parts[name], width=0.003, segments=1)

    return parts


def layout(deck_height):
    """Work out every point the rig hangs from, once.

    Public because the sails hang from the same points. A mainsail bent on a
    boom whose height was worked out twice is a mainsail that will slide off it
    the first time either copy is edited.
    """
    sheer = Curve(params.SHEER)

    mast_front = params.MAST_STATION
    mast_aft = mast_front + params.MAST_SECTION[1]
    mast_axis = (mast_front + mast_aft) / 2

    sheer_at_mast = sheer(mast_axis)
    heel_z = deck_height(mast_axis)
    masthead_z = sheer_at_mast + params.MASTHEAD_ABOVE_SHEER

    # Where the boom's forward band sits: rule F.2.2's lower measurement band.
    boom_z = sheer_at_mast + params.LOWER_BAND_ABOVE_SHEER

    # Foretriangle base, forward of the mast's front face.
    forestay_station = mast_front - params.FORETRIANGLE_BASE

    length = masthead_z - heel_z
    spreader_z = heel_z + length * params.SPREADER_HEIGHT_FRACTION
    babystay_z = heel_z + length * params.BABYSTAY_HEIGHT_FRACTION

    # Where the halyard clutches sit: just abaft the mast, on the coachroof,
    # facing the companionway -- so whoever comes forward from the cockpit to
    # tail a halyard is standing over them rather than beside the mast. Public
    # off `layout` for the reason the clutches themselves live in `fittings.py`
    # rather than here: they are deck hardware, not rig, but the rope has to
    # end exactly where the hardware is or the two drift apart the first time
    # either is re-authored.
    clutch_station = mast_axis + 0.140
    clutch_half_beam = 0.075

    return {
        "mast_axis": mast_axis,
        "mast_front": mast_front,
        "mast_aft": mast_aft,
        "heel_z": heel_z,
        "masthead_z": masthead_z,
        "boom_z": boom_z,
        "spreader_z": spreader_z,
        "babystay_z": babystay_z,
        "forestay_station": forestay_station,
        "forestay_z": deck_height(forestay_station),
        "backstay_station": params.LOA - 0.060,
        "backstay_z": deck_height(params.LOA - 0.060),
        "bridle_station": params.LOA - 0.030,
        "bridle_z": deck_height(
            params.LOA - 0.030, params.BACKSTAY_BRIDLE_HALF_BEAM
        ),
        "chainplate_z": deck_height(
            params.CHAINPLATE_STATION, params.CHAINPLATE_HALF_BEAM
        ),
        "babystay_foot_z": deck_height(params.BABYSTAY_STATION),
        "spreader_tip": params.MAST_SECTION[0] / 2 + params.SPREADER_LENGTH,
        "clutch_station": clutch_station,
        "clutch_half_beam": clutch_half_beam,
        "clutch_z": deck_height(clutch_station, clutch_half_beam),
    }


def _y(station):
    return params.station_to_y(station)


def boom_point(g, t):
    """A point along the boom's centreline at fraction `t` of its length --
    0 at the mast, 1 at the outer band.

    Public so anything that hangs off the boom -- the mainsheet, the vang, the
    topping lift -- reads the same line the spar itself is built from, rather
    than each re-deriving an approximation of where it is.
    """
    station = g["mast_aft"] + params.BOOM_LENGTH * t
    z = g["boom_z"] + params.BOOM_RISE * t
    return (0.0, _y(station), z)


# --------------------------------------------------------------------------
# Spars
# --------------------------------------------------------------------------


def _build_mast(collection, g):
    """A tapered oval extrusion, stepped on the coachroof.

    Deck-stepped, not keel-stepped -- rule F.7.1 is explicit that the mast
    stands on the coachroof, which is also why the coachroof has to be where it
    is: the mast station has to land on it.
    """
    width, depth = params.MAST_SECTION
    rings = []
    steps = 12

    for i in range(steps + 1):
        t = i / steps
        z = g["heel_z"] + (g["masthead_z"] - g["heel_z"]) * t

        # Taper only above the spreaders, as a real section does.
        above = max(0.0, (z - g["spreader_z"]) / (g["masthead_z"] - g["spreader_z"]))
        scale = 1.0 - (1.0 - params.MAST_TAPER) * above

        section = ellipse(width * scale, depth * scale)
        rings.append([(u, _y(g["mast_axis"]) + v, z) for (u, v) in section])

    obj = grid_to_mesh("mast", rings, collection, close_rings=True)
    cap_loop(obj, rings[0])
    cap_loop(obj, rings[-1])
    recalc_normals(obj)
    shade_smooth(obj, sharp_above_degrees=50.0)
    return obj


def _build_boom(collection, g):
    """From the mast's aft face, 2500 mm aft to the outer band."""
    width, height = params.BOOM_SECTION
    start, end = g["mast_aft"], g["mast_aft"] + params.BOOM_LENGTH

    rings = []
    steps = 8
    for i in range(steps + 1):
        t = i / steps
        station = start + (end - start) * t
        z = g["boom_z"] + params.BOOM_RISE * t
        section = ellipse(width, height)
        rings.append([(u, _y(station), z + v) for (u, v) in section])

    obj = grid_to_mesh("boom", rings, collection, close_rings=True)
    cap_loop(obj, rings[0])
    cap_loop(obj, rings[-1])
    recalc_normals(obj)
    shade_smooth(obj, sharp_above_degrees=50.0)
    return obj


def _build_spreaders(collection, g):
    """A pair, swept slightly aft, tapering outboard."""
    rings = []
    tip = g["spreader_tip"]
    root = params.MAST_SECTION[0] / 2

    for side in (-1, 1):
        span = []
        steps = 5
        for i in range(steps + 1):
            t = i / steps
            x = side * (root + (tip - root) * t)
            # Swept aft a little, and lifted, as spreaders are.
            station = g["mast_axis"] + 0.075 * t
            z = g["spreader_z"] + 0.045 * t
            section = ellipse(0.055 * (1 - 0.45 * t), 0.028 * (1 - 0.35 * t))
            span.append([(x, _y(station) + u, z + v) for (u, v) in section])
        rings.append(span)

    objs = []
    for i, span in enumerate(rings):
        obj = grid_to_mesh(f"spreader_{i}", span, collection, close_rings=True)
        cap_loop(obj, span[0])
        cap_loop(obj, span[-1])
        recalc_normals(obj)
        shade_smooth(obj, sharp_above_degrees=50.0)
        objs.append(obj)

    return join(objs, "spreaders")


# --------------------------------------------------------------------------
# Standing rigging
# --------------------------------------------------------------------------


def _build_rigging(collection, g):
    """Forestay, backstay, uppers over the spreaders, lowers and babystay.

    Every wire named on the brochure's rig drawing: forstag, hackstag, toppvant,
    undervant, babystag.
    """
    section = circle(params.STAY_DIAMETER / 2, 8)
    masthead = (0.0, _y(g["mast_axis"]), g["masthead_z"] - 0.040)

    # The backstay comes down the centreline to a plate above the after deck and
    # splits there, so the tiller has somewhere to be. See
    # `params.BACKSTAY_BRIDLE_HEIGHT`.
    split = (
        0.0,
        _y(g["backstay_station"]),
        g["backstay_z"] + params.BACKSTAY_BRIDLE_HEIGHT,
    )

    runs = [
        # Forestay, down to the stemhead.
        [masthead, (0.0, _y(g["forestay_station"]), g["forestay_z"])],
        # Backstay, down to the bridle plate.
        [masthead, split],
    ]

    for side in (-1, 1):
        runs.append(
            [
                split,
                (
                    side * params.BACKSTAY_BRIDLE_HALF_BEAM,
                    _y(g["bridle_station"]),
                    g["bridle_z"],
                ),
            ]
        )

    for side in (-1, 1):
        chainplate = (
            side * params.CHAINPLATE_HALF_BEAM,
            _y(params.CHAINPLATE_STATION),
            g["chainplate_z"],
        )
        spreader_tip = (
            side * g["spreader_tip"],
            _y(g["mast_axis"] + 0.075),
            g["spreader_z"] + 0.045,
        )

        # Upper shroud: masthead over the spreader tip, then down to the deck.
        runs.append([masthead, spreader_tip, chainplate])

        # Lower shroud: from just under the spreaders to the same chainplate.
        runs.append(
            [
                (
                    side * params.MAST_SECTION[0] / 2,
                    _y(g["mast_axis"]),
                    g["spreader_z"] - 0.060,
                ),
                chainplate,
            ]
        )

    # Babystay, forward to the coachroof.
    runs.append(
        [
            (0.0, _y(g["mast_front"]), g["babystay_z"]),
            (0.0, _y(params.BABYSTAY_STATION), g["babystay_foot_z"]),
        ]
    )

    objs = []
    for i, path in enumerate(runs):
        dense = _densify(path)
        obj = grid_to_mesh(
            f"stay_{i}", sweep_rings(section, dense), collection, close_rings=True
        )
        recalc_normals(obj)
        objs.append(obj)

    return join(objs, "rigging")


def _densify(path, per_segment=4):
    """Subdivide a polyline so swept tubes bend rather than kink."""
    out = [path[0]]
    for a, b in zip(path, path[1:]):
        for i in range(1, per_segment + 1):
            t = i / per_segment
            out.append(tuple(a[k] + (b[k] - a[k]) * t for k in range(3)))
    return out


def _lerp(a, b, t):
    return a + (b - a) * t


# --------------------------------------------------------------------------
# The gooseneck, spreader boots, masthead
#
# Three small fittings, none of them bigger than a fist, and each the one
# detail that would otherwise leave a spar reading as a bare extrusion at the
# point it does something: the boom just hinges rather than being fastened to
# anything, the shrouds just cross the spreader tip rather than being kept on
# it, and the masthead is a blunt taper with nothing on top of it.
# --------------------------------------------------------------------------


def _build_gooseneck(collection, g):
    """The fitting that hinges the boom to the mast: a strap round the mast
    face and a short pin the boom's forward end pivots on.

    A boom bolted straight to the mast reads as a spar growing out of another
    spar. Real ones do not touch -- there is always a jaw or a slide between
    them -- and this is the cheapest version of that gap: a saddle standing
    proud of the mast face, and the boom's own forward end land against it
    rather than inside it.
    """
    mast_w, mast_d = params.MAST_SECTION
    y0 = _y(g["mast_aft"]) - 0.006
    z = g["boom_z"]

    saddle = _box_local(
        "gooseneck_saddle",
        collection,
        -0.024,
        0.024,
        y0 - 0.018,
        y0 + 0.004,
        z - 0.028,
        z + 0.028,
    )
    pin = _tube_local(
        "gooseneck_pin",
        collection,
        [(-0.030, y0 - 0.010, z), (0.030, y0 - 0.010, z)],
        0.007,
    )
    return join([saddle, pin], "gooseneck")


def _build_spreader_boots(collection, g):
    """Rubber boots over the spreader tips, where the upper shroud crosses.

    Without one the wire would simply pass the tip in mid-air, which is not
    how a shroud stays on a spreader -- there is always a boot or a seizing
    holding it in the notch. Small enough that a plain lofted bump reads as
    one from any distance this camera path gets to.
    """
    boots = []
    for side in (-1, 1):
        x = side * g["spreader_tip"]
        station = g["mast_axis"] + 0.075
        z = g["spreader_z"] + 0.045
        rings = [
            [
                (
                    x + r * cos(2 * pi * j / 10),
                    _y(station) + r * sin(2 * pi * j / 10) * 0.7,
                    z,
                )
                for j in range(10)
            ]
            for r in (0.026, 0.030, 0.026)
        ]
        # Give the three rings a little height so the boot is a bead rather
        # than a disc: same plan, three different z.
        rings = [
            [(px, py, z + dz) for (px, py, _) in ring]
            for ring, dz in zip(rings, (-0.014, 0.0, 0.014))
        ]
        obj = grid_to_mesh(f"spreader_boot_{side}", rings, collection, close_rings=True)
        cap_loop(obj, rings[0])
        cap_loop(obj, list(reversed(rings[-1])))
        recalc_normals(obj)
        boots.append(obj)

    return join(boots, "spreader_boots")


def _build_masthead_unit(collection, g):
    """The sheave box at the truck, a windex, and a VHF whip.

    All three stand on the one point a masthead rig actually has at its top --
    the truck -- rather than needing anywhere of their own, which is why this
    reads as a unit rather than as three unrelated fittings sharing a
    coincidence of height.
    """
    x = 0.0
    y0 = _y(g["mast_axis"])
    top = g["masthead_z"]

    box = _box_local("masthead_box", collection, -0.028, 0.028, y0 - 0.045, y0 + 0.045, top, top + 0.045)

    # The windex: a needle on a pivot, canted to starboard the way a wind
    # vane settles when the boat is close-hauled on this tack -- the same
    # breeze `SAIL_DRAFT`'s sign describes.
    pivot_z = top + 0.045
    vane = _tube_local(
        "masthead_windex",
        collection,
        [
            (-0.140, y0 + 0.010, pivot_z + 0.030),
            (0.010, y0, pivot_z + 0.010),
            (0.150, y0 - 0.030, pivot_z + 0.006),
        ],
        0.004,
    )

    whip = _tube_local(
        "masthead_vhf",
        collection,
        [(x, y0 + 0.030, top + 0.045), (x, y0 + 0.030, top + 0.520)],
        0.0035,
        segments=6,
    )

    return join([box, vane, whip], "masthead_unit")


def _box_local(name, collection, x0, x1, y0, y1, z0, z1):
    """An axis-aligned box, given as six world coordinates -- the same shape
    `fittings._box` builds, kept local here so this module does not reach into
    a sibling's private helpers."""
    rings = [[(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)] for z in (z1, z0)]
    obj = grid_to_mesh(name, rings, collection, close_rings=True)
    cap_loop(obj, rings[0])
    cap_loop(obj, list(reversed(rings[1])))
    recalc_normals(obj)
    shade_smooth(obj, sharp_above_degrees=30.0)
    return obj


def _tube_local(name, collection, path, radius, segments=12):
    """A round bar following a polyline, capped at both ends -- kept local for
    the same reason as `_box_local`."""
    rings = sweep_rings(circle(radius, segments), _densify(path, per_segment=3))
    obj = grid_to_mesh(name, rings, collection, close_rings=True)
    cap_loop(obj, rings[0])
    cap_loop(obj, list(reversed(rings[-1])))
    recalc_normals(obj)
    shade_smooth(obj, sharp_above_degrees=50.0)
    return obj


# --------------------------------------------------------------------------
# Running rigging
#
# Standing rigging holds the mast up and does not move; running rigging is
# what a sailor actually handles, and its absence is most of why the rig used
# to read as a diagram. Halyards, the topping lift and the kicker are built
# here because all three answer to the mast or the boom; the sheets are
# `fittings.py`'s, because both ends of them are cockpit hardware.
# --------------------------------------------------------------------------

ROPE_RADIUS = 0.006
"""Running rigging, drawn fat enough to read as rope rather than wire -- about
12 mm of actual line, against `STAY_DIAMETER`'s 5 mm minimum for standing
rigging. Everything that is handled is thicker than everything that only
holds the rig up, which is true of the boat as well as the model."""


def _rope(name, collection, path, radius=ROPE_RADIUS, segments=8):
    """A length of running rigging: a tube, capped like a stay but fatter."""
    rings = sweep_rings(circle(radius, segments), _densify(path, per_segment=3))
    obj = grid_to_mesh(name, rings, collection, close_rings=True)
    cap_loop(obj, rings[0])
    cap_loop(obj, list(reversed(rings[-1])))
    recalc_normals(obj)
    return obj


def _sagged(a, b, sag, count=8):
    """A line from `a` to `b` with a shallow dip in the middle.

    A parabola, which is not the curve a hanging rope actually traces -- that
    is a catenary -- but the two are indistinguishable at the sag-to-span
    ratios anything on this boat hangs at, and a parabola is one multiply and
    an add cheaper to evaluate at every sample point. Used for rope that is
    not under load; anything sheeted home stays straight.
    """
    out = []
    for i in range(count + 1):
        t = i / count
        point = tuple(_lerp(a[k], b[k], t) for k in range(3))
        dip = sag * 4 * t * (1 - t)
        out.append((point[0], point[1], point[2] - dip))
    return out


def _unit(v):
    length = hypot(hypot(v[0], v[1]), v[2])
    return tuple(c / length for c in v) if length > 1e-9 else (0.0, 0.0, 1.0)


def _hanging_coil(collection, name, hook, facing, radius, turns, tube_radius=0.0055):
    """A hank of rope hung on a hook: a flattened spiral in the plane `facing`
    is normal to, each turn a little smaller and a little lower than the one
    outside it -- which is how a coiled line actually hangs rather than how it
    would if the coil were rigid.
    """
    up = (0.0, 0.0, 1.0)
    across = _unit(
        (facing[1] * up[2] - facing[2] * up[1],
         facing[2] * up[0] - facing[0] * up[2],
         facing[0] * up[1] - facing[1] * up[0])
    )
    if hypot(hypot(across[0], across[1]), across[2]) < 1e-6:
        across = (1.0, 0.0, 0.0)

    steps_per_turn = 14
    total = int(round(turns * steps_per_turn))
    path = []
    for i in range(total + 1):
        t = i / steps_per_turn
        angle = 2 * pi * t
        r = radius * (1.0 - 0.80 * t / turns)
        drop = tube_radius * 2.6 * t
        path.append(
            tuple(
                hook[k] + across[k] * r * cos(angle) + up[k] * (r * sin(angle) * 0.85 - drop)
                for k in range(3)
            )
        )

    rings = sweep_rings(circle(tube_radius, 8), path)
    obj = grid_to_mesh(name, rings, collection, close_rings=True)
    recalc_normals(obj)
    return obj


def _build_running_rigging(collection, g):
    """Halyards and their coiled tails at the mast, the topping lift, and the
    kicker."""
    y = _y
    masthead = (0.0, y(g["mast_axis"]), g["masthead_z"] - 0.060)

    clutch = (0.0, y(g["clutch_station"]), g["clutch_z"] + 0.075)
    port_clutch = (clutch[0] - g["clutch_half_beam"], clutch[1], clutch[2])
    stbd_clutch = (clutch[0] + g["clutch_half_beam"], clutch[1], clutch[2])

    main_halyard_top = (-0.020, masthead[1], masthead[2])
    genoa_halyard_top = (0.020, masthead[1], masthead[2])

    parts = [
        _rope("main_halyard", collection, [main_halyard_top, stbd_clutch]),
        _rope("genoa_halyard", collection, [genoa_halyard_top, port_clutch]),
        _hanging_coil(
            collection, "main_halyard_coil", stbd_clutch, (0.0, -1.0, 0.0), 0.055, 3.2
        ),
        _hanging_coil(
            collection, "genoa_halyard_coil", port_clutch, (0.0, -1.0, 0.0), 0.055, 3.2
        ),
    ]

    # Topping lift: it holds the boom up when the sail is off it, and goes
    # slack once the main is set and taking the boom's weight instead -- which
    # is the state this boat is always shown in, so it hangs rather than runs
    # taut.
    lift_top = (0.0, y(g["mast_axis"] - 0.030), g["masthead_z"] - 0.100)
    boom_end = boom_point(g, 0.97)
    boom_end = (boom_end[0], boom_end[1], boom_end[2] + 0.035)
    parts.append(_rope("topping_lift", collection, _sagged(lift_top, boom_end, 0.070, 10)))

    # Kicker/vang: mast foot to a third of the way along the boom, taut --
    # sheeted flat and close-hauled, it is doing its job of holding the boom
    # down rather than hanging slack.
    vang_foot = (0.0, y(g["mast_aft"] + 0.015), g["boom_z"] - 0.150)
    vang_boom = boom_point(g, 0.30)
    vang_boom = (vang_boom[0], vang_boom[1], vang_boom[2] - 0.025)
    parts.append(_rope("vang", collection, [vang_foot, vang_boom], radius=0.009))

    return join(parts, "running_rigging")


# --------------------------------------------------------------------------
# Sail cover
# --------------------------------------------------------------------------


def _build_sail_cover(collection, g):
    """A cover over a flaked mainsail, sitting on the boom.

    Cheap, and it does a lot: a boat at anchor with a bare boom looks
    unfinished, and this is the difference between a model of a boat and a
    boat that has been put to bed.
    """
    start, end = g["mast_aft"] + 0.060, g["mast_aft"] + params.BOOM_LENGTH - 0.120
    rings = []
    steps = 10

    for i in range(steps + 1):
        t = i / steps
        station = start + (end - start) * t
        z = g["boom_z"] + params.BOOM_RISE * t

        # Fat at the mast, tapering aft, with a slack belly under the boom.
        girth = 1.0 - 0.55 * t**1.4
        width = 0.150 * girth
        height = 0.230 * girth

        section = ellipse(width, height, 14)
        rings.append([(u, _y(station), z + v * 0.9 + 0.045) for (u, v) in section])

    obj = grid_to_mesh("sailcover", rings, collection, close_rings=True)
    cap_loop(obj, rings[0])
    cap_loop(obj, rings[-1])
    recalc_normals(obj)
    shade_smooth(obj, sharp_above_degrees=40.0)
    return obj

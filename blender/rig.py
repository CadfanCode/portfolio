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

import params
from lib.curves import Curve
from lib.mesh import cap_loop, grid_to_mesh, join, recalc_normals, shade_smooth
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

    if params.SAIL_COVER:
        parts["sailcover"] = _build_sail_cover(collection, geometry)

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
    }


def _y(station):
    return params.station_to_y(station)


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
    section = circle(params.STAY_DIAMETER / 2, 6)
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

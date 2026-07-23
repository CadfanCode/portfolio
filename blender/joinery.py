"""
The furniture: bulkheads, galley, steps, table, quarter berth, mast post.

Everything here is a box, and that is a deliberate choice rather than a
shortcut. The liner in interior.py is a moulding and wants to be a lofted
surface; these are panels, and on the real boat they are flat sheets cut to the
hull. Building them as anything smoother would be modelling something the boat
does not have.

Two of them are not boxes on the real boat either, and are boxes here because
the camera never gets close enough to tell: the drawer fronts of the
companionway steps, and the drop-leaf table, whose leaves fold. Both are called
out where they are built.

The wardrobe and the clothes locker are the conspicuous absentees. They are not
built, because they do not need to be: the 1975 boat has "dubbla huvudskott
mellan salong och forpik", and the compartment those two bulkheads enclose *is*
the wardrobe to port and the clothes locker to starboard. Build the bulkheads
and the lockers are already there.
"""

import interior
import params
from lib.mesh import bevel, cap_loop, grid_to_mesh, recalc_normals


def build(collection):
    """Build the joinery. Returns a dict of named objects."""
    inner = interior.hull_inner_function()

    built = {
        "bulkheads": _build_bulkheads(collection, inner),
        "galley": _build_galley(collection, inner),
        "quarter_berth": _build_quarter_berth(collection, inner),
        "steps": _build_steps(collection),
        # The step grab rail was removed at the owner's request. Its builder is
        # kept below; add it back to this dict to restore it.
        "table": _build_table(collection),
    }

    if params.HAS_MAST_POST:
        built["mast_post"] = _build_mast_post(collection)

    return built


def _box(name, collection, station_a, station_b, x0, x1, z0, z1):
    """An axis-aligned box, given as two stations, two half-offsets and two
    heights. `x0`/`x1` are signed, so a box knows which side it is on."""
    ya, yb = params.station_to_y(station_a), params.station_to_y(station_b)

    rings = [
        [(x0, ya, z), (x1, ya, z), (x1, yb, z), (x0, yb, z)] for z in (z1, z0)
    ]

    obj = grid_to_mesh(name, rings, collection, close_rings=True)
    cap_loop(obj, rings[0])
    cap_loop(obj, list(reversed(rings[1])))
    recalc_normals(obj)
    return obj


def _hull_block(
    name, collection, inner, side, station_a, station_b, x_in, z0, z1, rise=5
):
    """A block whose inboard face is flat and whose outboard face is the hull.

    A plain box cannot do this job, and the reason is worth stating because it
    is not visible in any render. Amidships the hull is 1080 mm wide at worktop
    height and 520 mm at sole height. A rectangular locker cut to the hull at
    its top therefore stands half a metre *outside* it at its bottom -- and it
    looks perfectly correct from inside, because the part that is wrong is
    behind the topsides where nothing can see it. The clearance check in
    verify.py is what found it; the first galley built here was 547 mm out.

    `side` is -1 for port, +1 for starboard. `x_in` is the inboard face, given
    as a positive half-offset.
    """
    rings = []
    for station in _stations(station_a, station_b, 4):
        y = params.station_to_y(station)
        base = _floor(inner, station, x_in, z0, z1)

        # Inboard foot, out along the bottom, up the hull, back in at the top.
        # `close_rings` then joins the top back to the foot down the inboard
        # face, which is the one face that is genuinely flat.
        ring = [(x_in, base)]
        for i in range(rise + 1):
            z = base + (z1 - base) * i / rise
            ring.append((max(x_in, inner(station, z)), z))
        ring.append((x_in, z1))

        rings.append([(side * x, y, z) for (x, z) in ring])

    obj = grid_to_mesh(name, rings, collection, close_rings=True)
    cap_loop(obj, rings[0])
    cap_loop(obj, list(reversed(rings[-1])))
    recalc_normals(obj)
    return obj


def _panel(name, collection, outline, side, station_a, station_b):
    """A flat panel of some outline, given thickness between two stations.

    `outline` is a closed loop of (half-offset, height) walked in order, which
    is how a bulkhead has to be described: its foot rises where the hull tucks
    in under it and its head falls where the deckhead does, so neither edge is
    a straight line and no pair of corners describes it.
    """
    rings = [
        [(side * x, params.station_to_y(s), z) for (x, z) in outline]
        for s in (station_a, station_b)
    ]

    obj = grid_to_mesh(name, rings, collection, close_rings=True)
    cap_loop(obj, rings[0])
    cap_loop(obj, list(reversed(rings[1])))
    recalc_normals(obj)
    return obj


def _floor(inner, station, x_in, z0, z1, steps=48):
    """How low a block with its inboard face at `x_in` can reach at a station.

    Not always `z0`. The hull tucks in as it goes down -- 1075 mm of half-beam
    at worktop height amidships against 521 at the sole -- so a galley front
    600 mm off the centreline has hull, not cabin, below about the settee.
    Its locker bottoms out there, which is exactly what the bilge of a boat
    does to a piece of furniture standing against it.

    Scanned rather than solved: the section curve is monotonic in z but its
    exponents move station to station, and a scan needs no assumptions about
    either.
    """
    for i in range(steps + 1):
        z = z0 + (z1 - z0) * i / steps
        if inner(station, z) >= x_in:
            return z
    return z1


def _stations(start, end, count):
    step = (end - start) / (count - 1)
    return [start + step * i for i in range(count)]


def _join(objs, name):
    """Merge several boxes into one object, so the build reports one thing per
    piece of furniture rather than one per panel."""
    import bmesh
    import bpy

    objs = [o for o in objs if o is not None]
    target = objs[0]
    target.name = name
    target.data.name = name

    bm = bmesh.new()
    for obj in objs:
        bm.from_mesh(obj.data)
    bm.to_mesh(target.data)
    bm.free()

    for obj in objs[1:]:
        bpy.data.objects.remove(obj, do_unlink=True)

    return target


def _deckhead_z(station):
    """The ceiling on the centreline at a station, which is what a full-height
    panel has to reach."""
    import deck

    return deck.height_function()(station) - params.DECKHEAD_THICKNESS


def _build_bulkheads(collection, inner):
    """The two main bulkheads, with the way through to the forepeak between
    them.

    Each is built as two panels, port and starboard, stopping at the doorway
    rather than as one panel with a hole in it. The gap runs full height: on
    the real boat there is a curtain across it, and a curtain is not geometry.
    """
    panels = []
    ceiling = interior.deckhead_function()
    steps = 12

    for index, station in enumerate((params.BULKHEAD_FWD, params.BULKHEAD_AFT)):
        base = interior.floor_level(station)
        # No wider than the hull is at the sheer: above that there is no hull
        # for the panel to be cut to, only deck moulding tumbling back inboard.
        out = inner(station, interior.sheer_z(station))

        # Walk the outline: out along the foot, up the outboard edge, back
        # along the ceiling. The foot rises where the hull tucks in under it and
        # the head falls where the deckhead does, so the panel is cut to both.
        foot, head = [], []
        for i in range(steps + 1):
            x = params.LOCKER_DOORWAY_HALF_WIDTH + (
                out - params.LOCKER_DOORWAY_HALF_WIDTH
            ) * i / steps
            top = ceiling(station, x)
            bottom = _floor(inner, station, x, base, top)
            foot.append((x, min(bottom, top)))
            head.append((x, top))

        outline = foot + list(reversed(head))

        for side in (-1, 1):
            panels.append(
                _panel(
                    f"bulkhead_{index}_{side}",
                    collection,
                    outline,
                    side,
                    station,
                    station + 0.018,
                )
            )

    obj = _join(panels, "bulkheads")
    bevel(obj, width=0.003, segments=2)
    return obj


def _build_galley(collection, inner):
    """The pentry: worktop and lockers, port, at the after end of the saloon.

    One block. The sink is recessed into it and the two-burner hob beside them
    is recessed too -- "Nedsankta ar ocksa dom tva stora matforvaringsboxarna"
    -- so from any distance the whole run reads as a single worktop with things
    let into it, which is what this is.
    """
    out = inner(params.GALLEY_START, params.GALLEY_TOP)

    obj = _hull_block(
        "galley",
        collection,
        inner,
        -1,  # port
        params.GALLEY_START,
        params.GALLEY_END,
        max(0.0, out - params.GALLEY_DEPTH),
        params.SOLE_LEVEL,
        params.GALLEY_TOP,
    )
    bevel(obj, width=0.004, segments=2)
    return obj


def _build_quarter_berth(collection, inner):
    """The stickkoj, starboard, running aft under the cockpit seat.

    Stops where the cockpit sole comes down to meet it. Most of its length is
    under the bridgedeck with no headroom over it at all, which is the whole
    idea of a quarter berth and the reason it costs the saloon nothing.
    """
    obj = _hull_block(
        "quarter_berth",
        collection,
        inner,
        1,  # starboard
        params.QUARTER_BERTH_START,
        params.QUARTER_BERTH_END,
        params.STEP_HALF_WIDTH,
        params.SOLE_LEVEL,
        params.SETTEE_LEVEL,
    )
    bevel(obj, width=0.004, segments=2)
    return obj


def _build_steps(collection):
    """The way below: "tva stora dragbara lador", two big pull-out drawers, plus
    a stowage compartment in the top step -- carried on a ladder-frame carcase
    with a teak tread nosed out past its own riser.

    Modelled closed, as nested boxes. The drawers are the point of them on the
    real boat and they are invisible here -- what a drawer front looks like shut
    is a flat panel, which is what each carcase box's forward face still is.

    What is new is that the carcase and the tread are no longer the same box.
    The carcase stops TREAD_NOSING short of where the tread does and
    TREAD_THICKNESS below it, and a separate slab sits on top and reaches the
    rest of the way to the front -- which is where a nosing comes from, and it
    is also what puts a real gap under every tread: the overhang has nothing
    beneath it but the riser one step down, the shadow line a built-up wooden
    stair casts and a moulded box does not.

    Each tread is three narrow slats rather than one slab, a few millimetres
    apart -- teak laid this way *is* the non-slip surface on a boat this age,
    the same reasoning `fittings.cockpit_grating` uses on the footwell sole
    above.
    """
    carcase = []
    treads = []
    station = params.COCKPIT_START
    slat_gap = 0.008
    width = params.STEP_HALF_WIDTH * 2
    slat_width = (width - 2 * slat_gap) / 3

    for i in range(params.STEP_TREADS):
        # Nested boxes, each running aft to the bulkhead: the lowest tread
        # reaches furthest into the cabin and each one above it stops a tread
        # shorter, so the stack is a staircase.
        #
        # The depth used to grow with the height instead, which makes the
        # *tallest* box the longest -- and a tall long box in front of a short
        # one is not a staircase, it is a single block with two steps hidden
        # inside it. It read as a lectern standing in the middle of the saloon.
        tread_top = params.SOLE_LEVEL + params.STEP_RISE * (i + 1)
        carcase_top = tread_top - params.TREAD_THICKNESS
        reach = params.STEP_DEPTH * (params.STEP_TREADS - i)
        carcase_reach = reach - params.TREAD_NOSING

        carcase.append(
            _box(
                f"step_carcase_{i}",
                collection,
                station - carcase_reach,
                station,
                -params.STEP_HALF_WIDTH,
                params.STEP_HALF_WIDTH,
                params.SOLE_LEVEL,
                carcase_top,
            )
        )

        for s in range(3):
            x0 = -params.STEP_HALF_WIDTH + s * (slat_width + slat_gap)
            treads.append(
                _box(
                    f"step_tread_{i}_{s}",
                    collection,
                    station - reach,
                    station,
                    x0,
                    x0 + slat_width,
                    carcase_top,
                    tread_top,
                )
            )

    obj = _join(carcase + treads, "steps")
    bevel(obj, width=0.0025, segments=2)
    return obj


def _build_step_grabrail(collection):
    """A handhold at the top of the steps, standing proud of the top riser.

    Coming down backwards is the only sane way onto a companionway this steep,
    so the rail exists to be found by a hand that is not looking -- a bar
    athwart the front of the top step, on two feet, the same shape
    `fittings.py` builds for the mainsheet horse and for the same reason: a
    straight bar at hand height is a shape you can read from across the cabin.
    """
    from math import cos, pi, sin

    top_tread = params.SOLE_LEVEL + params.STEP_RISE * params.STEP_TREADS
    carcase_top = top_tread - params.TREAD_THICKNESS
    carcase_reach = params.STEP_DEPTH - params.TREAD_NOSING
    face_station = params.COCKPIT_START - carcase_reach
    y = params.station_to_y(face_station) - 0.020  # standing proud of the riser

    z_bar = carcase_top + params.GRABRAIL_HEIGHT
    half = params.STEP_HALF_WIDTH - 0.030
    radius = params.GRABRAIL_RADIUS
    segments = 8

    def ring_yz(x, y_c, z_c):
        return [
            (
                x,
                y_c + radius * cos(2 * pi * i / segments),
                z_c + radius * sin(2 * pi * i / segments),
            )
            for i in range(segments)
        ]

    def ring_xy(x_c, y_c, z):
        return [
            (
                x_c + radius * cos(2 * pi * i / segments),
                y_c + radius * sin(2 * pi * i / segments),
                z,
            )
            for i in range(segments)
        ]

    def tube(name, rings):
        obj = grid_to_mesh(name, rings, collection, close_rings=True)
        cap_loop(obj, rings[0])
        cap_loop(obj, list(reversed(rings[-1])))
        recalc_normals(obj)
        return obj

    pieces = [
        tube("step_grabrail_bar", [ring_yz(x, y, z_bar) for x in (-half, half)])
    ]
    for side in (-1, 1):
        x = side * half
        pieces.append(
            tube(
                f"step_grabrail_foot_{side}",
                [ring_xy(x, y, z) for z in (carcase_top, z_bar)],
            )
        )

    return _join(pieces, "step_grabrail")


def _build_table(collection):
    """The saloon table, on the centreline between the settees.

    A slab. On the boat it is a drop-leaf with both leaves down when nobody is
    eating, and up it is nearly the width of the saloon -- but the camera stop
    is at the after end looking forward, where the difference between a folded
    leaf and a thick edge is a few millimetres of silhouette.
    """
    length = 0.900
    # Hung on the mast post, with its forward edge 170 mm ahead of it -- so the
    # post runs through the table rather than grazing its edge, which is what
    # placing the table off the saloon instead used to give.
    #
    # 170 and not a third of the length, which is where a one-legged table would
    # want its leg: the post is only 350 mm abaft the bulkhead, and a 900 mm
    # table balanced about it has its forward edge against the locker doors.
    mid = params.MAST_POST_STATION - 0.170 + length / 2
    top = params.TABLE_TOP  # off the sole, not off the seat: a table is a
    # table height whatever is drawn beside it -- and, since the owner's brief,
    # the same number the galley worktop is built to (see params.GALLEY_TOP).

    obj = _box(
        "table",
        collection,
        mid - length / 2,
        mid + length / 2,
        -params.SOLE_HALF_WIDTH,
        params.SOLE_HALF_WIDTH,
        top - 0.030,
        top,
    )
    bevel(obj, width=0.004, segments=2)
    return obj


def _build_mast_post(collection):
    """The compression post under the mast step: a round alloy tube, on a heel
    fitting where it lands on the sole.

    The one thing below deck that is not a panel, and the only thing here that
    is not built as a box. It is a drawn section, it is on the centreline of a
    1.9 m saloon with the camera looking straight down it, and a square post read
    as a structural column in the middle of the room -- which is what it is, but
    not what it looks like.

    It is also the leg of the table. Both jobs are the same post on the real
    boat, which is why the table is where it is.

    The heel fitting is the same argument in miniature: a tube meeting the sole
    with no foot under it reads as a pole stuck through the floor rather than as
    something carrying a load. A short flared flange -- taller than it needs to
    be structurally, so it actually reads as a casting rather than a chamfer --
    is what every deck-stepped post like this has where it lands.

    UNVERIFIED -- see params.HAS_MAST_POST. It is here because a deck-stepped
    mast has to get its load down somehow and this is the usual way, not because
    any reference to hand shows one.
    """
    from math import cos, pi, sin

    radius = params.MAST_POST_DIAMETER / 2
    flange_radius = radius * 1.8
    flange_height = 0.030
    y = params.station_to_y(params.MAST_POST_STATION)

    def ring(r, z):
        return [
            (r * cos(2 * pi * i / 12), y + r * sin(2 * pi * i / 12), z)
            for i in range(12)
        ]

    rings = [
        ring(radius, _deckhead_z(params.MAST_POST_STATION)),
        ring(radius, params.SOLE_LEVEL + flange_height),
        ring(flange_radius, params.SOLE_LEVEL + flange_height),
        ring(flange_radius, params.SOLE_LEVEL),
    ]

    obj = grid_to_mesh("mast_post", rings, collection, close_rings=True)
    cap_loop(obj, rings[0])
    cap_loop(obj, list(reversed(rings[-1])))
    recalc_normals(obj)
    return obj

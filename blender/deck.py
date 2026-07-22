"""
The deck moulding: foredeck, coachroof, side decks and cockpit.

This is the recognisability step. The hull underneath is shared with a lot of
1970s pocket cruisers; what makes a Maxi 77 look like a Maxi 77 is the deck --
long, low and flat, with almost no superstructure and unusually wide side decks.

Built as two lofted surfaces rather than one:

    forward   the stem back to the aft face of the coachroof
    aft       the coachroof aft face back to the transom, containing the cockpit

Splitting them there keeps each with a single consistent cross-section, which a
one-piece deck could not have -- the forward half needs a raised coachroof in
the middle, the aft half a sunken cockpit in the same place.

Within each half the section keeps a fixed point count and features fade out by
collapsing rather than by changing topology. The coachroof shrinks to nothing at
its forward end, and the cockpit does the same aft of it, so both fair into the
surrounding deck the way a GRP moulding does instead of stopping at a hard edge.
"""

import params
from lib.curves import Curve
from lib.mesh import cap_loop, grid_to_mesh, mirror_x, recalc_normals, shade_smooth, transom_loop


TOP_POINTS = 7
"""Points across the coachroof top, or the cockpit sole, centreline outwards."""

ROOF_CENTRE_POINTS = 5
ROOF_SHOULDER_POINTS = 2
"""How the coachroof's `TOP_POINTS` are split once the raised section over the
companionway is on it: across its flat top, then down the shoulder to the
coachroof edge. They still sum to `TOP_POINTS`, so the roof carries the raised
section without costing the mesh a single vertex."""

SIDE_POINTS = 4
"""Points up a coachroof side or a cockpit well side."""

DECK_POINTS = 6
"""Points across a side deck."""


def build(collection):
    """Build the deck. Returns (forward, aft, companionway, sailbox, windows)."""
    sheer = Curve(params.SHEER)
    half_beam = Curve(params.HALF_BEAM)

    forward = _build_forward(collection, sheer, half_beam)
    aft = _build_aft(collection, sheer, half_beam)
    companionway = _build_companionway(collection, sheer, half_beam)
    sailbox = _build_sailbox(collection, sheer, half_beam)
    windows = _build_windows(collection, sheer, half_beam)

    return forward, aft, companionway, sailbox, windows


def _lerp(a, b, t):
    return a + (b - a) * t


def _smoothstep(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def _sheer_edge(sheer, half_beam, station):
    """Where the deck meets the hull: the top of the hull skin, inboard of the
    rubrail, which is exactly where the hull's own sheer strake ends."""
    return max(0.0, half_beam(station) - params.RUBRAIL_PROUD), sheer(station)


def _camber(x, half_width, crown):
    """Deck crown at a given half-offset. Parabolic, zero at the sheer."""
    if half_width <= 0:
        return crown
    return crown * (1 - (x / half_width) ** 2)


MAX_HALF_BEAM = params.BEAM_AT_STATION / 2 - params.RUBRAIL_PROUD


def _crown(edge_x):
    """Camber at the centreline for a section of this half-beam.

    Held as a fixed proportion of local beam, the way a builder sets camber,
    rather than as one height everywhere. A constant crown puts the full 65 mm
    on the stem, where the deck is a hand's width across, and the bow ends in a
    spike instead of a point.
    """
    return params.DECK_CAMBER * max(0.0, edge_x) / MAX_HALF_BEAM


BAND_POINTS = 3
"""Points down the topside band, deck edge to rubrail."""


_CABIN_BAND = Curve(params.CABIN_BAND)
_COMPANIONWAY_RAISE = Curve(params.COMPANIONWAY_RAISE)


def companionway_raise(station, t_out=0.0):
    """How far the raised centre panel stands above whatever it is sitting on,
    at a fractional half-offset -- 0 on the centreline, 1 at the deck edge.

    Swept, exactly as `deck_lift` sweeps the step below it, and for the same
    reason: sweeping the *sample station* rather than the height gives every
    point the identical profile at a different moment, so the panel cannot come
    out a different height on the centreline than at its own edge.

    Sweeping it is what points the nose. The panel reaches nothing at the apex
    on the centreline and a `DECK_STEP_SWEEP` later at each offset outboard of
    it, so the line where it leaves the deck is a chevron on exactly the rake of
    the step's -- the panel noses forward to a point, over the point the raised
    deck already makes, instead of ending in a face across the front of it.

    The sweep runs the other way from `deck_lift`'s: that one is anchored at the
    deck edge and reaches furthest forward on the centreline, while this is
    anchored on the centreline, at the apex the other one arrives at. Same rake,
    same direction of lead, different end held still.
    """
    return _COMPANIONWAY_RAISE(station - params.DECK_STEP_SWEEP * t_out)


def companionway_raise_width(station):
    """Half-width of the raised panel, as a fraction of the coachroof's own.

    Straight-line taper, not eased. The shoulder either side of the panel is a
    moulded gable with a crease down each edge of it, and those creases want to
    be straight in plan for the same reason they are straight in section.
    """
    span = params.COACHROOF_END - params.COMPANIONWAY_RAISE_FORWARD
    t = (station - params.COMPANIONWAY_RAISE_FORWARD) / span
    t = max(0.0, min(1.0, t))
    return _lerp(
        params.COMPANIONWAY_RAISE_WIDTH_FORWARD,
        params.COMPANIONWAY_RAISE_WIDTH,
        t,
    )


def band_height(station):
    """How far the deck edge stands above the rubrail at a station.

    Forward of the cockpit this is the cabin side, deepening aft as it goes --
    which is what keeps the deck line level while the rubrail below it falls
    away. Aft of the cockpit bulkhead it drops to a coaming. The drawing shows
    that step as a short ramp rather than a cliff, so it is ramped here too.
    """
    ramp = 0.240

    if station <= params.COCKPIT_START:
        return _CABIN_BAND(station)
    if station >= params.COCKPIT_START + ramp:
        return params.AFT_BAND

    t = _smoothstep((station - params.COCKPIT_START) / ramp)
    return _lerp(_CABIN_BAND(params.COCKPIT_START), params.AFT_BAND, t)


def _band_points(edge_x, edge_z, station):
    """The band, walked downwards from the deck edge to the rubrail.

    Returned separately from the deck because every section ends with it, and
    because the windows need to sit on exactly this surface.
    """
    height = band_height(station)
    deck_x = max(0.0, edge_x - params.BAND_TUMBLE)

    points = []
    for i in range(1, BAND_POINTS + 1):
        t = i / BAND_POINTS
        points.append((_lerp(deck_x, edge_x, t), edge_z + height * (1 - t)))
    return points


def deck_edge(edge_x, edge_z, station):
    """Top of the band: where the deck surface actually starts."""
    return max(0.0, edge_x - params.BAND_TUMBLE), edge_z + band_height(station)


def deck_lift(station, t_out):
    """How far the deck stands above the rubrail, at a fractional half-offset --
    0 on the centreline, 1 at the deck edge.

    Everywhere except across the step this is just `band_height`. The step is
    the exception: it is a chevron, not a square wall, so a point out towards the
    sheer meets the same riser further aft. Sweeping the *sample station* rather
    than the height is what makes that work -- every point gets the identical
    step profile, only at a different moment, so the riser cannot come out a
    different height on the centreline than at the deck edge.

    Nothing is swept aft of the cockpit. The band drops to the aft coaming
    there, and a sample running into that drop would pull the forward deck's
    centreline down by 120 mm and tear it away from the aft half where the two
    meet.
    """
    if station >= params.COCKPIT_START:
        return band_height(station)

    swept = station + params.DECK_STEP_SWEEP * (1.0 - t_out)
    return band_height(min(swept, params.COCKPIT_START))


def band_surface_function():
    """Where the band's outer face is, by station and height.

    Returns None for heights outside the band. Used to paint the band, which
    needs an exact test rather than an approximate one: near the transom the
    band and the outer edge of the cockpit well end up barely a centimetre
    apart, and any "is it far enough outboard" rule paints one as the other.
    """
    sheer = Curve(params.SHEER)
    half_beam = Curve(params.HALF_BEAM)

    def surface(station, z):
        raw_x, raw_z = _sheer_edge(sheer, half_beam, station)
        height = band_height(station)
        if not raw_z - 0.002 <= z <= raw_z + height + 0.002:
            return None
        return _band_surface_x(raw_x, raw_z, station, z)

    return surface


def height_function():
    """Height of the deck or coachroof on the centreline, by station.

    The rig needs this: the mast is stepped on the coachroof and every stay foot
    lands on deck, so all of them have to follow whatever the deck is doing
    rather than being given heights of their own to drift out of step with.
    """
    sheer = Curve(params.SHEER)
    half_beam = Curve(params.HALF_BEAM)
    roof_half = Curve(params.COACHROOF_HALF_WIDTH)
    roof_height = Curve(params.COACHROOF_HEIGHT)

    def height(station):
        raw_x, raw_z = _sheer_edge(sheer, half_beam, station)
        edge_x, _ = deck_edge(raw_x, raw_z, station)
        crown = _crown(edge_x)
        deck_at = _deck_surface(station, raw_z, edge_x, crown)

        presence = _coachroof_presence(station)
        rw = _coachroof_half_width(roof_half, station, edge_x)

        # Forward in the bow the deck runs out of width before the coachroof's
        # half-width does, and there is nothing up here but deck. The raise is
        # zero that far forward, but it is carried rather than dropped: this
        # branch is a guard on the geometry, not a statement about the panel.
        if rw <= 0.0:
            return deck_at(0.0) + companionway_raise(station)

        rh = roof_height(station)
        deck_crown = deck_at(0.0) - deck_at(rw)
        return (
            deck_at(rw)
            + rh
            + _lerp(deck_crown, crown * 0.45, presence)
            + companionway_raise(station)
        )

    return height


def _deck_surface(station, raw_z, edge_x, crown):
    """The deck surface of this section, as a function of half-offset.

    Shared by the deck builder and by `height_function`, which the rig reads to
    land the mast step and every stay foot on the deck. They have to agree: the
    swept step moves the centreline by a few millimetres, and a mast stepped on
    a separately-computed height would float that far off it.
    """

    def deck_at(x):
        t_out = x / edge_x if edge_x > 0 else 1.0
        return raw_z + deck_lift(station, t_out) + _camber(x, edge_x, crown)

    return deck_at


# --------------------------------------------------------------------------
# Forward half: foredeck, coachroof, side decks
# --------------------------------------------------------------------------


def _build_forward(collection, sheer, half_beam):
    roof_half = Curve(params.COACHROOF_HALF_WIDTH)
    roof_height = Curve(params.COACHROOF_HEIGHT)

    stations = _stations(0.0, params.COACHROOF_END, 130)
    rings = [
        _forward_section(s, sheer, half_beam, roof_half, roof_height)
        for s in stations
    ]

    obj = grid_to_mesh("deck_forward", rings, collection)
    mirror_x(obj)

    # The aft end is an open section -- the coachroof's aft face and the deck
    # around it. Close it, or the cockpit half butts against a hole.
    cap_loop(obj, transom_loop(rings[-1]))

    recalc_normals(obj)
    shade_smooth(obj, sharp_above_degrees=32.0)
    return obj


def _coachroof_presence(station):
    """How much of the coachroof's own camber applies at a station: 1 over its
    length, easing to 0 at its forward end so the roof takes on its flatter
    crown gradually instead of switching to it.

    It used to switch on, and with a 30 mm tumblehome and 8 mm of height nobody
    could see it. Given a real slope and a real height it showed at once: over
    one station the point distribution jumped from all-deck to a third-of-a-metre
    of roof, and the nose came out as a fold with a crease running away from it.

    The roof's *height* is no longer faded by this -- `COACHROOF_HEIGHT` starts
    at zero and eases itself in. Fading a height in on top of a curve that
    already starts at zero only bends the gradient, and a bent gradient in the
    middle of the nose is the swelling this was supposed to prevent.
    """
    fade = params.COACHROOF_NOSE_FADE

    if station < params.COACHROOF_START:
        return 0.0
    if station < params.COACHROOF_START + fade:
        return _smoothstep((station - params.COACHROOF_START) / fade)
    if station <= params.COACHROOF_END:
        return 1.0
    return 0.0


def _coachroof_half_width(roof_half, station, edge_x):
    """Half-width of the coachroof top, held continuous fore and aft of it.

    Held rather than dropped to zero outside the coachroof, because this width
    only places the section's points once the roof has faded out -- and points
    that jump from one station to the next crease a lofted surface whether or
    not there is any height on them. `Curve` holds the end values of its own
    accord, so there is nothing to clamp here.

    Kept clear of the sheer, so a side deck always survives.
    """
    return max(0.0, min(roof_half(station), edge_x - 0.170))


def _forward_section(station, sheer, half_beam, roof_half, roof_height):
    """One transverse section: centreline over the coachroof, down its side,
    out across the side deck, then down the topside band to the rubrail.

    Every height inboard of the sheer comes from `deck_at`, which carries the
    swept step. That is what turns a straight riser into a chevron: the section
    itself never changes shape, it just meets the step at a different station at
    each half-offset."""
    raw_x, raw_z = _sheer_edge(sheer, half_beam, station)
    edge_x, _ = deck_edge(raw_x, raw_z, station)

    presence = _coachroof_presence(station)
    rw = _coachroof_half_width(roof_half, station, edge_x)
    rh = roof_height(station)

    crown = _crown(edge_x)
    deck_at = _deck_surface(station, raw_z, edge_x, crown)
    flare = params.COACHROOF_SIDE_FLARE
    points = []

    def roof_at(x):
        """The coachroof top at a half-offset, before the raised section.

        Cambered like the deck, just less -- and blended back to the deck's own
        camber as the roof fades out, so at presence zero these points land
        exactly on the deck instead of leaving a flatter-cambered plateau
        sitting in it.

        Its base is the deck at the coachroof's own half-width, so the whole
        roof rides on the swept step rather than cutting across it.
        """
        roof_crown = _camber(x, rw, crown * 0.45) if rw > 0 else 0.0
        deck_crown = deck_at(x) - deck_at(rw)
        return deck_at(rw) + rh + _lerp(deck_crown, roof_crown, presence)

    # Flat top of the raised section over the companionway. It keeps the roof's
    # own camber -- this is a panel lifted off the coachroof, not a level plate
    # laid on it. The two share a forward end at the step's apex, so there is
    # nowhere the panel is standing on anything but coachroof.
    def lift_at(x):
        """The panel's rise at a half-offset, on the same sweep as the step."""
        return companionway_raise(station, x / edge_x if edge_x > 0 else 0.0)

    lift_half = rw * companionway_raise_width(station)

    for i in range(ROOF_CENTRE_POINTS):
        t = i / (ROOF_CENTRE_POINTS - 1)
        x = lift_half * t
        points.append((x, roof_at(x) + lift_at(x)))

    # Shoulder, sloping down from that top to the coachroof edge. Straight, not
    # eased: a moulded gable with a crease at each end of it, which the 32-degree
    # sharp-edge threshold then keeps as a crease. The lift is swept, so near the
    # nose it is already zero out here while the centreline still has some, and
    # the gable closes itself down to nothing without being told to.
    for i in range(1, ROOF_SHOULDER_POINTS + 1):
        t = i / ROOF_SHOULDER_POINTS
        x = _lerp(lift_half, rw, t)
        points.append((x, roof_at(x) + lift_at(x) * (1 - t)))

    # Coachroof side, sloping out and down to meet the side deck. Landed on
    # `deck_at(x)` rather than on the roof's base height, so the foot of the
    # slope *is* the deck: at 75 mm of flare the difference between the two is a
    # step you can see, where at the 30 mm this replaced it was hidden.
    for i in range(1, SIDE_POINTS + 1):
        s = _smoothstep(i / SIDE_POINTS)
        x = rw + flare * s
        points.append((x, deck_at(x) + rh * (1 - s)))

    # Side deck, out to the sheer.
    base_x = rw + flare
    for i in range(1, DECK_POINTS + 1):
        t = i / DECK_POINTS
        x = _lerp(base_x, edge_x, t)
        points.append((x, deck_at(x)))

    # Down the band to the hull, where the deck moulding meets the rubrail.
    points.extend(_band_points(raw_x, raw_z, station))

    y = params.station_to_y(station)
    return [(x, y, z) for (x, z) in points]


# --------------------------------------------------------------------------
# Aft half: cockpit well and afterdeck
# --------------------------------------------------------------------------


def _build_aft(collection, sheer, half_beam):
    stations = _stations(params.COACHROOF_END, params.LOA, 46)
    rings = [_aft_section(s, sheer, half_beam) for s in stations]

    obj = grid_to_mesh("deck_aft", rings, collection)
    mirror_x(obj)

    cap_loop(obj, transom_loop(rings[0]))
    cap_loop(obj, transom_loop(rings[-1]))

    recalc_normals(obj)
    shade_smooth(obj, sharp_above_degrees=32.0)
    return obj


def _aft_section(station, sheer, half_beam):
    """One transverse section: centreline on the cockpit sole, out across the
    seat, up the well side, then the side deck to the sheer."""
    from math import radians, tan

    raw_x, raw_z = _sheer_edge(sheer, half_beam, station)
    edge_x, edge_z = deck_edge(raw_x, raw_z, station)

    # The transom rakes, so the aftmost sections lean forward with the hull.
    rake = 0.0
    fade_start = params.LOA - 1.600
    if station > fade_start:
        t = _smoothstep((station - fade_start) / 1.600)
        rake = t * tan(radians(params.TRANSOM_RAKE))

    # How much cockpit there is here: full through the well, fading at each end
    # so the sole rises into the afterdeck rather than stopping at a cliff.
    depth = _cockpit_presence(station)

    crown = _crown(edge_x)

    def deck_at(x):
        """The deck surface at a half-offset, before the well is cut into it."""
        return edge_z + _camber(x, edge_x, crown)

    seat_outer = min(params.COCKPIT_WIDTH / 2, edge_x - 0.055)
    seat_inner = max(0.0, seat_outer - params.COCKPIT_SEAT_WIDTH)

    # Everything in the well is a *drop below the deck*, never an absolute
    # height. That matters at the two ends, where the well fades out: measured
    # absolutely, the sole levelled off at the deck edge while the deck around
    # it stayed cambered, and the mismatch stood up as a thin wall along the
    # inboard edge of each side deck. Expressed as a drop, everything collapses
    # onto the deck exactly when the drop reaches zero.
    #
    # The well side tops out flush with the side deck for the same reason. It
    # used to carry on past it into a raised coaming, but with no thickness
    # modelled that came out as an 8 mm blade standing 90 mm proud of the deck,
    # tapering to a spike where the well faded out at the transom -- a fin, not
    # a coaming. A coaming worth having needs a section of its own.
    sole_drop = params.COCKPIT_SOLE_BELOW_SHEER * depth
    seat_drop = params.COCKPIT_SEAT_BELOW_SHEER * depth

    points = []

    # Cockpit sole, centreline out to the foot of the seat.
    for i in range(TOP_POINTS):
        t = i / (TOP_POINTS - 1)
        x = seat_inner * t
        points.append((x, deck_at(x) - sole_drop))

    # Seat face and seat top.
    for i in range(1, SIDE_POINTS + 1):
        s = _smoothstep(i / SIDE_POINTS)
        x = seat_inner + 0.020 * s
        points.append((x, deck_at(x) - _lerp(sole_drop, seat_drop, s)))
    points.append((seat_outer, deck_at(seat_outer) - seat_drop))

    # Well side, seat top up to the side deck.
    for i in range(1, SIDE_POINTS + 1):
        s = _smoothstep(i / SIDE_POINTS)
        x = seat_outer + 0.045 * s
        points.append((x, deck_at(x) - _lerp(seat_drop, 0.0, s)))

    # Side deck outboard of the well, out to the sheer.
    base_x = seat_outer + 0.045
    for i in range(1, DECK_POINTS + 1):
        t = i / DECK_POINTS
        x = _lerp(base_x, edge_x, t)
        points.append((x, deck_at(x)))

    points.extend(_band_points(raw_x, raw_z, station))

    y = params.station_to_y(station)
    return [(x, y + rake * (raw_z - z), z) for (x, z) in points]


def _cockpit_presence(station):
    """How deep the well is at a station: 1 through the cockpit, easing to 0
    just outside it. Keeps the ends of the well moulded rather than cut."""
    fade = 0.130

    if station < params.COCKPIT_START:
        return 0.0
    if station < params.COCKPIT_START + fade:
        return _smoothstep((station - params.COCKPIT_START) / fade)
    if station < params.COCKPIT_END - fade:
        return 1.0
    if station < params.COCKPIT_END:
        return _smoothstep((params.COCKPIT_END - station) / fade)
    return 0.0


# --------------------------------------------------------------------------
# Openings
# --------------------------------------------------------------------------


def _recess(name, collection, station_a, station_b, half_width, z_top, z_bottom):
    """A rectangular well let into a surface: four sides and a floor, open at
    the top.

    Modelled as a recess rather than cut through with a boolean. From the fixed
    camera path the difference is invisible -- you look *at* the companionway
    from the cockpit and then the camera cuts below, nobody walks through it --
    and it avoids booleans, which need object context that behaves differently
    in background Blender than it does in the GUI.
    """
    ya, yb = params.station_to_y(station_a), params.station_to_y(station_b)
    w = half_width

    rings = [
        [(-w, ya, z_top), (w, ya, z_top), (w, yb, z_top), (-w, yb, z_top)],
        [(-w, ya, z_bottom), (w, ya, z_bottom), (w, yb, z_bottom), (-w, yb, z_bottom)],
    ]

    obj = grid_to_mesh(name, rings, collection, close_rings=True)
    cap_loop(obj, rings[1])
    recalc_normals(obj)
    return obj


def _build_windows(collection, sheer, half_beam):
    """The cabin windows, let into the topside band.

    Long and low -- roughly 900 x 135 mm for the saloon light -- with the ends
    raked, which is what stops them reading as slots cut in a wall. They follow
    the band's own surface, inset, so they curve with the topsides instead of
    sitting flat on a curved boat.

    These are the single most recognisable thing about the boat, and the first
    version of this deck had none: the band they live in was read as a painted
    stripe rather than as structure.
    """
    objs = []

    for index, (forward, aft) in enumerate(params.WINDOWS):
        for side in (-1, 1):
            rings = []
            steps = 18

            for i in range(steps + 1):
                t = i / steps
                station = _lerp(forward, aft, t)
                raw_x, raw_z = _sheer_edge(sheer, half_beam, station)
                _, top_z = deck_edge(raw_x, raw_z, station)

                # Fill the band between its margins, so the window tapers with
                # it rather than hanging below the rubrail forward.
                full = max(
                    0.0,
                    band_height(station)
                    - params.WINDOW_MARGIN_TOP
                    - params.WINDOW_MARGIN_BOTTOM,
                )
                middle = top_z - params.WINDOW_MARGIN_TOP - full / 2

                # Rake the ends in, so the window is a lozenge, not a slot.
                taper = min(1.0, min(t, 1 - t) / 0.11)
                height = full * max(0.0, taper)

                # Follow the band's own surface, which leans inboard as it
                # rises, so the pane sits on the topsides rather than through
                # them.
                surface = _band_surface_x(raw_x, raw_z, station, middle)
                outer = side * (surface + params.WINDOW_PROUD)
                inner = side * (surface + params.WINDOW_PROUD - params.WINDOW_THICKNESS)

                y = params.station_to_y(station)
                top, bottom = middle + height / 2, middle - height / 2
                rings.append(
                    [(outer, y, top), (outer, y, bottom), (inner, y, bottom), (inner, y, top)]
                )

            name = f"window_{index}_{'p' if side < 0 else 's'}"
            obj = grid_to_mesh(name, rings, collection, close_rings=True)
            cap_loop(obj, rings[0])
            cap_loop(obj, rings[-1])
            recalc_normals(obj)
            shade_smooth(obj, sharp_above_degrees=25.0)
            objs.append(obj)

    return _join(objs, "windows")


def _band_surface_x(raw_x, raw_z, station, z):
    """Half-beam of the band's outer face at a given height."""
    height = band_height(station)
    if height <= 0:
        return raw_x

    t = max(0.0, min(1.0, (raw_z + height - z) / height))
    return _lerp(max(0.0, raw_x - params.BAND_TUMBLE), raw_x, t)


def _join(objs, name):
    """Merge into one object, so the export carries one window mesh not four."""
    import bmesh
    import bpy

    if not objs:
        return None

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


def _build_companionway(collection, sheer, half_beam):
    """The way below, in the aft face of the coachroof."""
    roof_height = Curve(params.COACHROOF_HEIGHT)
    station = params.COACHROOF_END

    edge_x, edge_z = _sheer_edge(sheer, half_beam, station)
    top = edge_z + _crown(edge_x) + roof_height(station)

    return _recess(
        "companionway",
        collection,
        station - params.COMPANIONWAY_DEPTH,
        station,
        params.COMPANIONWAY_WIDTH / 2,
        top,
        top - 0.620,
    )


def _build_sailbox(collection, sheer, half_beam):
    """The drained anchor and sail locker in the foredeck.

    Its lid is flush -- the brochure makes a point that nothing stands proud of
    the foredeck to trip over -- so what shows is the seam around it.
    """
    mid = (params.SAILBOX_START + params.SAILBOX_END) / 2
    raw_x, raw_z = _sheer_edge(sheer, half_beam, mid)
    edge_x, _ = deck_edge(raw_x, raw_z, mid)

    # Sit the lid flush at its outboard edges rather than at the centreline.
    # The deck is cambered, so a lid levelled on the crown stands proud at its
    # corners, and one levelled on a guess at the average buries itself.
    deck_at = _deck_surface(mid, raw_z, edge_x, _crown(edge_x))
    top = deck_at(params.SAILBOX_HALF_WIDTH)

    return _recess(
        "sailbox",
        collection,
        params.SAILBOX_START,
        params.SAILBOX_END,
        params.SAILBOX_HALF_WIDTH,
        top,
        top - 0.020,
    )


def _stations(start, end, count):
    """Even station spacing over a span, both ends included."""
    step = (end - start) / (count - 1)
    return [start + step * i for i in range(count)]

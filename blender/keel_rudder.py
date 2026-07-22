"""
The underwater appendages: fin keel, skeg and transom-hung rudder.

All three are lofted foil sections, built the same way as the hull -- stack
horizontal rings and skin between them. The keel and skeg grow down from the
canoe body, so their roots are placed on the hull's own profile curve rather
than at a flat height; that keeps them attached wherever the rocker puts the
bottom, and keeps the displacement measurement honest by not burying volume
inside the hull.

The skeg is easy to overlook. No specification table mentions it, and it is
faint in the drawing, but the brochure calls it out directly: "Tittar du under
skrovet upptacker du en fena som gar mellan kolen och rodret."
"""

import params
from lib.curves import Curve
from lib.foils import foil_ring
from lib.mesh import cap_loop, grid_to_mesh, recalc_normals, shade_smooth


SECTION_POINTS = 20
"""Points per half-section. Foils are small on screen; this is plenty."""


def build(collection):
    """Build keel, skeg and rudder. Returns them in that order."""
    profile = Curve(params.PROFILE)

    keel = _build_keel(collection, profile)
    skeg = _build_skeg(collection, profile) if params.HAS_SKEG else None
    rudder = _build_rudder(collection)

    return keel, skeg, rudder


def _lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def _loft_foil(name, collection, levels, close_bottom=True):
    """Skin a stack of foil rings into a solid.

    `levels` is a list of (le_station, te_station, thickness, z) from top to
    bottom. The top is left open -- it is buried in the hull -- and the bottom
    is capped.
    """
    rings = [
        foil_ring(le, te, thickness, z, SECTION_POINTS, params.station_to_y)
        for (le, te, thickness, z) in levels
    ]

    obj = grid_to_mesh(name, rings, collection, close_rings=True)

    # Cap both ends. The top is buried in the hull and never seen, but a closed
    # solid is what lets `verify.py` weigh the casting.
    cap_loop(obj, rings[0])
    if close_bottom:
        cap_loop(obj, rings[-1])

    recalc_normals(obj)
    shade_smooth(obj, sharp_above_degrees=45.0)

    return obj


def _build_keel(collection, profile):
    """The iron fin and its bulb, from the canoe body down to class draft.

    Driven by the table in `params.KEEL_SECTIONS` rather than by interpolating
    root to tip, because a bulb is not something a root-to-tip blend can
    express: the fin thins steadily downwards and then the casting swells back
    out over the bottom fifth, which needs the shape stated at both ends of that
    swelling.
    """
    le_curve = Curve([(s[0], s[1]) for s in params.KEEL_SECTIONS])
    te_curve = Curve([(s[0], s[2]) for s in params.KEEL_SECTIONS])
    thickness_curve = Curve([(s[0], s[3]) for s in params.KEEL_SECTIONS])

    root_station = (params.KEEL_SECTIONS[0][1] + params.KEEL_SECTIONS[0][2]) / 2
    z_root = profile(root_station)

    levels = []
    steps = 26  # dense enough that the bulb reads as round, not faceted

    for i in range(steps + 1):
        t = i / steps
        z = _lerp(z_root, -params.DRAFT, t)
        levels.append((le_curve(t), te_curve(t), thickness_curve(t), z))

    return _loft_foil("keel", collection, levels)


def _build_skeg(collection, profile):
    """The shallow fin running aft from the keel towards the rudder.

    Its root follows the canoe body, so it stays glued to the hull as the rocker
    rises aft, and it fades to nothing at both ends rather than stopping square.
    """
    levels = []
    steps = 6

    start, end = params.SKEG_START_STATION, params.SKEG_END_STATION

    for i in range(steps + 1):
        t = i / steps
        z_hull = profile(_lerp(start, end, 0.5))
        z = z_hull - params.SKEG_DEPTH * t

        # Taper the fin's length as it goes down so it reads as a fin, not a box.
        inset = 0.25 * t
        levels.append(
            (
                start + inset,
                end - inset * 0.4,
                params.SKEG_THICKNESS * (1 - 0.5 * t),
                z,
            )
        )

    return _loft_foil("skeg", collection, levels)


def rudder_axis():
    """Where the blade is hung: `(hinge station, rake)`.

    Hang the blade on the transom, not in the water behind it. The transom leans
    aft, so where its face sits depends on the height the pintles are at --
    taking the station at the sheer instead leaves the rudder floating a clear
    100 mm astern of the boat.

    Public because the tiller has to start where the rudder ends. Steering gear
    given a station of its own drifts off the blade the moment the transom rake
    or the freeboard moves, and the failure looks like a tiller that is merely
    slightly too long.
    """
    from math import radians, tan

    rake = tan(radians(params.TRANSOM_RAKE))
    transom_at_hinge = params.LOA - (params.FREEBOARD_STERN - params.RUDDER_TOP) * rake
    return transom_at_hinge + 0.020, rake


def _build_rudder(collection):
    """Transom-hung blade, raked with the transom it hangs on.

    Kept as its own object with its pivot at the top of the leading edge, since
    a rudder that can be angled is worth having later -- it is the cheapest
    possible signal that the boat is a real thing and not a prop.
    """
    hinge_station, rake = rudder_axis()
    levels = []
    steps = 8

    for i in range(steps + 1):
        t = i / steps
        z = _lerp(params.RUDDER_TOP, -params.RUDDER_DEPTH, t)

        # Follow the transom's rake so the blade hangs parallel to it.
        le = hinge_station - (params.RUDDER_TOP - z) * rake
        chord = _lerp(params.RUDDER_CHORD_TOP, params.RUDDER_CHORD_BOTTOM, t)

        # Round the foot off over the last stretch rather than ending square.
        if t > 0.85:
            chord *= 1 - ((t - 0.85) / 0.15) ** 2 * 0.55

        levels.append((le, le + chord, params.RUDDER_THICKNESS, z))

    obj = _loft_foil("rudder", collection, levels)

    # Origin at the hinge, so the blade can be rotated later without hunting for
    # the right pivot.
    _set_origin(obj, (0.0, params.station_to_y(hinge_station), params.RUDDER_TOP))

    return obj


def _set_origin(obj, world_origin):
    """Move an object's origin without moving its geometry."""
    from mathutils import Vector

    offset = Vector(world_origin)
    for vertex in obj.data.vertices:
        vertex.co -= offset
    obj.location = offset

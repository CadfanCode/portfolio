"""
The hull surface.

Built as a lofted set of transverse sections rather than sculpted: a station
spacing along the length, a parametric section at each station, and quads
skinned between them. That gives clean, predictable topology and -- more
usefully -- means the shape is entirely described by the curves in `params.py`.

Each station's section runs from the centreline profile (the stem rake forward,
the canoe-body rocker amidships, the transom bottom aft) up to the sheer. At
the bow the profile meets the sheer and the beam goes to zero, so the section
collapses to a point on its own; no special case is needed for the stem.
"""

import params
from lib.curves import Curve, hull_section
from lib.mesh import (
    cap_loop,
    grid_to_mesh,
    mirror_x,
    recalc_normals,
    shade_smooth,
    transom_loop,
)


def build(collection):
    """Build the hull skin and rubrail. Returns (hull_object, rubrail_object)."""
    sheer = Curve(params.SHEER)
    profile = Curve(params.PROFILE)
    half_beam = Curve(params.HALF_BEAM)
    fullness = Curve(params.SECTION_FULLNESS)
    tuck = Curve(params.SECTION_TUCK)

    stations = _station_distribution(params.HULL_STATIONS)

    rings = []
    for s in stations:
        # Beam curves are given to the outside of the rubrail, because that is
        # how the class rules measure. The skin itself sits inboard of that.
        beam_outer = half_beam(s)
        beam_skin = max(0.0, beam_outer - params.RUBRAIL_PROUD)

        z_sheer = sheer(s)
        section = hull_section(
            half_beam=beam_skin,
            z_sheer=z_sheer,
            z_bottom=profile(s),
            fullness=fullness(s),
            tuck=tuck(s),
            count=params.HULL_SECTION_POINTS,
        )

        y = params.station_to_y(s)
        rake = _transom_rake_offset(s, z_sheer)
        rings.append([(x, y + rake(z), z) for (x, z) in section])

    hull = grid_to_mesh("hull", rings, collection)

    # The last station is the transom: a real panel, not a closing point. It has
    # to be capped after mirroring, because the panel spans both halves.
    mirror_x(hull)
    if not cap_loop(hull, transom_loop(rings[-1])):
        print("[hull] warning: transom did not close")

    recalc_normals(hull)
    shade_smooth(hull, sharp_above_degrees=40.0)

    rubrail = _build_rubrail(collection, sheer, half_beam, stations)

    return hull, rubrail


def _station_distribution(count: int) -> list[float]:
    """Station positions along the hull, bunched towards the ends.

    The bow and transom are where curvature is highest and where the class-rule
    measurements are taken, so they want more sections than the middle, which is
    nearly straight. Cosine spacing does that.

    Blended half-and-half with even spacing, though, because pure cosine bunches
    so hard at the ends that the last two stations land 2 mm apart. That is
    wasted geometry anywhere, and once the transom is raked it also collapses
    the transom panel into a sliver.
    """
    from math import cos, pi

    stations = []
    for i in range(count):
        t = i / (count - 1)
        cosine = (1 - cos(pi * t)) / 2
        stations.append(params.LOA * (0.5 * cosine + 0.5 * t))

    return stations


def _transom_rake_offset(station: float, z_sheer: float):
    """How far forward a point sits because the transom leans aft.

    The transom is raked about 10 degrees, so its foot is forward of its head.
    Rather than raking only the final section -- which would leave a crease
    where it met an unraked one -- the rake fades in over the last stretch of
    the hull, so the run aft curves into the transom the way a moulded hull
    does.

    Zero at the sheer, growing downwards, which keeps the hull's greatest
    length at the rubrail where the rules measure it.
    """
    from math import radians, tan

    fade_length = 1.600
    start = params.LOA - fade_length

    if station <= start:
        return lambda z: 0.0

    t = (station - start) / fade_length
    blend = t * t * (3 - 2 * t)  # smoothstep, so the run fairs in
    slope = blend * tan(radians(params.TRANSOM_RAKE))

    return lambda z: (z_sheer - z) * slope


def _build_rubrail(collection, sheer, half_beam, stations):
    """The avbarrarlist: a small proud strip running the length of the sheer.

    It matters more than it looks. The rules measure both overall length and
    beam *including* this rail, so it is what `verify.py` reads for those two
    checks, and it is also the strongest horizontal line on the real boat.
    """
    height = 0.045
    rings = []

    for s in stations:
        outer = half_beam(s)
        inner = max(0.0, outer - params.RUBRAIL_PROUD)
        z = sheer(s)
        y = params.station_to_y(s)
        rake = _transom_rake_offset(s, z)

        # A squared-off D in section: flush inboard, rounded proud face.
        # Raked with the hull so it stays welded to the sheer at the transom.
        rings.append(
            [
                (inner, y + rake(z), z),
                (outer, y + rake(z - height * 0.25), z - height * 0.25),
                (outer, y + rake(z - height * 0.65), z - height * 0.65),
                (inner, y + rake(z - height), z - height),
            ]
        )

    rail = grid_to_mesh("rubrail", rings, collection, close_rings=True)
    mirror_x(rail)
    recalc_normals(rail)
    shade_smooth(rail, sharp_above_degrees=35.0)

    return rail

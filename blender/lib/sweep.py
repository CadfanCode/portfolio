"""
Sweeping a cross-section along a path.

Used for the standing rigging, where a wire runs diagonally through space and a
circular section has to follow it, and for the deck rails, which do the same
thing round corners. Straight members like the mast and boom are built directly
as axis-aligned lofts instead -- for those, a general sweep buys nothing and
only adds a frame-orientation bug waiting to happen.
"""

from mathutils import Vector


def circle(radius: float, count: int = 8) -> list[tuple[float, float]]:
    """A closed circular section, for wire."""
    from math import cos, pi, sin

    return [
        (radius * cos(2 * pi * i / count), radius * sin(2 * pi * i / count))
        for i in range(count)
    ]


def ellipse(width: float, depth: float, count: int = 16) -> list[tuple[float, float]]:
    """A closed elliptical section, for spar extrusions."""
    from math import cos, pi, sin

    return [
        (width / 2 * cos(2 * pi * i / count), depth / 2 * sin(2 * pi * i / count))
        for i in range(count)
    ]


def sweep_rings(
    section: list[tuple[float, float]], path: list[tuple[float, float, float]]
) -> list[list[tuple[float, float, float]]]:
    """Place `section` at every point of `path`, square to the path.

    The frame is carried along the run rather than rebuilt at each point: the
    first ring is squared to the path against an arbitrary reference, and every
    ring after it is the previous one rotated by however much the tangent
    turned. That is parallel transport, and it is the only version of this that
    survives a bend.

    Rebuilding the frame per point is what this used to do, and it works exactly
    until the path turns far enough that the reference vector has to be swapped
    for another one -- at which point the frame jumps by ninety degrees between
    two adjacent rings and the tube pinches shut where it is skinned across the
    jump. Straight runs never reach that, which is why the standing rigging
    never showed it; the pulpit and the tiller reach it twice each.
    """
    points = [Vector(p) for p in path]
    tangents = []

    for i, point in enumerate(points):
        ahead = points[min(i + 1, len(points) - 1)]
        behind = points[max(i - 1, 0)]
        tangent = ahead - behind
        if tangent.length < 1e-9:
            tangent = Vector((0.0, 0.0, 1.0))
        tangents.append(tangent.normalized())

    # Any reference not parallel to the first tangent will do -- from here on the
    # frame is transported rather than chosen, so this is the only choice made.
    reference = Vector((0.0, 0.0, 1.0))
    if abs(tangents[0].dot(reference)) > 0.95:
        reference = Vector((0.0, 1.0, 0.0))
    u_axis = tangents[0].cross(reference).normalized()

    rings = []
    for i, point in enumerate(points):
        if i > 0:
            u_axis.rotate(tangents[i - 1].rotation_difference(tangents[i]))
            u_axis = u_axis.normalized()

        v_axis = u_axis.cross(tangents[i]).normalized()
        rings.append([tuple(point + u_axis * u + v_axis * v) for (u, v) in section])

    return rings

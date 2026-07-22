"""
Sweeping a cross-section along a path.

Used for the standing rigging, where a wire runs diagonally through space and a
circular section has to follow it. Straight members like the mast and boom are
built directly as axis-aligned lofts instead -- for those, a general sweep buys
nothing and only adds a frame-orientation bug waiting to happen.
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

    The section is only meaningful for round profiles, where its rotation about
    the path does not matter -- there is no attempt to keep a consistent twist
    along the run, which a shaped section would need.
    """
    points = [Vector(p) for p in path]
    rings = []

    for i, point in enumerate(points):
        ahead = points[min(i + 1, len(points) - 1)]
        behind = points[max(i - 1, 0)]
        tangent = (ahead - behind)
        if tangent.length < 1e-9:
            tangent = Vector((0.0, 0.0, 1.0))
        tangent.normalize()

        # Any reference that is not parallel to the tangent will do.
        reference = Vector((0.0, 0.0, 1.0))
        if abs(tangent.dot(reference)) > 0.95:
            reference = Vector((0.0, 1.0, 0.0))

        u_axis = tangent.cross(reference).normalized()
        v_axis = u_axis.cross(tangent).normalized()

        rings.append(
            [tuple(point + u_axis * u + v_axis * v) for (u, v) in section]
        )

    return rings

"""
Curve fitting for hull lines.

Hull curves are given as a handful of control points and need to be evaluated
densely. A plain Catmull-Rom spline overshoots between unevenly spaced points,
which on a hull shows up as a bulge in the topsides or a hollow that should not
be there. Shape-preserving cubic Hermite interpolation (Fritsch-Carlson) avoids
that: it never invents an extremum between two control points, so what you type
into `params.py` is what you get.
"""

from bisect import bisect_right


class Curve:
    """A 1-D curve through (x, y) control points, evaluated by shape-preserving
    cubic Hermite interpolation.

    Control points must be sorted by x. Evaluating outside their range clamps to
    the end values rather than extrapolating -- extrapolated hull lines are
    never what you want.
    """

    def __init__(self, points: list[tuple[float, float]]):
        if len(points) < 2:
            raise ValueError("a curve needs at least two control points")

        self.xs = [p[0] for p in points]
        self.ys = [p[1] for p in points]

        if any(b <= a for a, b in zip(self.xs, self.xs[1:])):
            raise ValueError("control points must be strictly increasing in x")

        self.slopes = _fritsch_carlson_slopes(self.xs, self.ys)

    def __call__(self, x: float) -> float:
        xs, ys, m = self.xs, self.ys, self.slopes

        if x <= xs[0]:
            return ys[0]
        if x >= xs[-1]:
            return ys[-1]

        i = bisect_right(xs, x) - 1
        h = xs[i + 1] - xs[i]
        t = (x - xs[i]) / h

        # Cubic Hermite basis.
        t2 = t * t
        t3 = t2 * t
        h00 = 2 * t3 - 3 * t2 + 1
        h10 = t3 - 2 * t2 + t
        h01 = -2 * t3 + 3 * t2
        h11 = t3 - t2

        return h00 * ys[i] + h10 * h * m[i] + h01 * ys[i + 1] + h11 * h * m[i + 1]

    def sample(self, x0: float, x1: float, count: int) -> list[float]:
        """`count` evenly spaced values across [x0, x1], inclusive of both ends."""
        if count < 2:
            raise ValueError("need at least two samples")
        step = (x1 - x0) / (count - 1)
        return [self(x0 + step * i) for i in range(count)]


def _fritsch_carlson_slopes(xs: list[float], ys: list[float]) -> list[float]:
    """Tangents that keep the interpolant monotone wherever the data is."""
    n = len(xs)
    deltas = [(ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]) for i in range(n - 1)]

    # Start from three-point differences, one-sided at the ends.
    m = [0.0] * n
    m[0] = deltas[0]
    m[-1] = deltas[-1]
    for i in range(1, n - 1):
        if deltas[i - 1] * deltas[i] <= 0:
            m[i] = 0.0  # a local extremum: flatten to avoid overshoot
        else:
            m[i] = (deltas[i - 1] + deltas[i]) / 2

    # Clamp so no segment can overshoot its own endpoints.
    for i in range(n - 1):
        if deltas[i] == 0:
            m[i] = m[i + 1] = 0.0
            continue
        a = m[i] / deltas[i]
        b = m[i + 1] / deltas[i]
        s = a * a + b * b
        if s > 9:
            scale = 3.0 / (s ** 0.5)
            m[i] = scale * a * deltas[i]
            m[i + 1] = scale * b * deltas[i]

    return m


def hull_section(
    half_beam: float,
    z_sheer: float,
    z_bottom: float,
    fullness: float,
    tuck: float,
    count: int,
) -> list[tuple[float, float]]:
    """One transverse half-section, from the centreline keel up to the sheer.

    Returns `count` (x, z) pairs following

        x = half_beam * (1 - u ** fullness) ** (1 / tuck)

    where u runs 0 at the sheer to 1 at the keel. Two exponents rather than the
    usual one, because the two ends of a section want independent control:

    `fullness` shapes the topsides and the turn of the bilge. Any value above 1
    gives vertical topsides at the sheer, which is what a hull does; raising it
    hardens the bilge and squares the section off.

    `tuck` shapes the garboards, and is the one that matters. It sets the slope
    where the section meets the centreline:

        tuck > 1   flat floors, the section meets the keel horizontally
        tuck = 1   a straight V, deadrise proportional to `fullness`
        tuck < 1   hollow garboards, the section tucks in above the keel

    A single-exponent superellipse is stuck at the first of those, which puts
    roughly twice the volume into a fin-keel hull as it should have. Deadrise
    is not a detail here -- it is most of the displacement.
    """
    depth = z_sheer - z_bottom
    if depth <= 0 or half_beam <= 0:
        # Degenerate station -- the stem, where the section is a single point.
        return [(0.0, z_sheer)] * count

    points = []
    for i in range(count):
        t = i / (count - 1)  # 0 at the keel, 1 at the sheer
        u = 1.0 - t  # normalised depth below the sheer
        x = half_beam * (1.0 - u**fullness) ** (1.0 / tuck)
        z = z_sheer - u * depth
        points.append((x, z))

    return points

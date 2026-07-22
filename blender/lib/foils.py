"""
Foil sections for the keel, rudder and skeg.

All three are symmetric aerofoils in plan section: a rounded leading edge, a
maximum thickness around a third of the way aft, and a fine trailing edge. The
NACA four-digit symmetric thickness distribution gives that shape from a single
thickness ratio, which is all the control needed here -- nobody is going to
measure the boat's lift-to-drag ratio in a browser.
"""


def naca_symmetric(chord: float, thickness: float, count: int) -> list[tuple[float, float]]:
    """Half a symmetric foil section: `count` (along-chord, offset) pairs.

    Runs from the leading edge at 0 to the trailing edge at `chord`. Offsets are
    the half-thickness, so the full section is this mirrored about the chord
    line.

    Points are spaced by a cosine so the leading edge, where curvature is
    highest, gets the density it needs and the straight run aft does not waste
    any.
    """
    from math import cos, pi

    if chord <= 0 or thickness <= 0:
        return [(0.0, 0.0)] * count

    ratio = thickness / chord
    points = []

    for i in range(count):
        t = i / (count - 1)
        x = (1 - cos(pi * t)) / 2  # 0 at the leading edge, 1 at the trailing

        half = (
            5
            * ratio
            * (
                0.2969 * x**0.5
                - 0.1260 * x
                - 0.3516 * x**2
                + 0.2843 * x**3
                - 0.1015 * x**4
            )
        )
        points.append((x * chord, half * chord))

    # Close the trailing edge. The NACA polynomial leaves it slightly open,
    # which would show as a sliver of backface along the whole trailing edge.
    points[-1] = (chord, 0.0)

    return points


def foil_ring(
    le_station: float,
    te_station: float,
    thickness: float,
    z: float,
    count: int,
    station_to_y,
) -> list[tuple[float, float, float]]:
    """A closed horizontal section of a foil, as a ring of world-space points.

    Chord runs fore-and-aft, thickness athwartships. Returns the full loop --
    down the starboard side from the leading edge and back up the port side --
    so it can be lofted directly against the ring above or below it.
    """
    chord = te_station - le_station
    half = naca_symmetric(chord, thickness, count)

    starboard = [(off, station_to_y(le_station + along), z) for along, off in half]
    port = [(-off, y, zz) for off, y, zz in reversed(starboard[1:-1])]

    return starboard + port

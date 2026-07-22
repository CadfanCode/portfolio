"""
The sails: mainsail and genoa, bent on and drawing.

Everything else on this boat is built from measurements. A sail is not: the
class rules give its three sides to the millimetre and say nothing at all about
the only thing that makes it look like a sail, which is the shape in the cloth.
So the outline here comes from the rules and the shape comes from three numbers
in `params.py` -- how much camber, where along the chord it sits, and how far the
leech twists off by the head.

That split is deliberate and it is the whole design of this module. The outline
is fixed; the shape is what a wind does. Both sails are generated as a plain
`(chord x height)` grid from a single function of those three numbers, so making
them react to wind later is a matter of driving the numbers from a direction and
a strength -- and, for the mainsail, swinging the boom. No part of the geometry
needs re-authoring for that, and nothing in here knows which way the wind is
blowing except the sign of the camber.

They are set as if close-hauled on starboard: main sheeted flat on the
centreline, both sails full to port, twist opening the leeches aloft. The boat is
at anchor, so strictly they should be slatting -- and a slatting sail is a cloth
simulation, which is a lot of work to make something look limp.

The sails are single surfaces with no thickness. Blender exports them with
`doubleSided` set, because the material does not cull backfaces, so three.js
draws both sides of one sheet. A sail is 0.3 mm of Dacron and modelling it as a
solid would cost twice the faces to render something nobody can see the edge of.
"""

from math import atan2, cos, hypot, pi, sin

import bpy

import deck
import params
import rig
from lib.mesh import grid_to_mesh, join, shade_smooth


CHORD_POINTS = 13
HEIGHT_POINTS = 15
"""The grid. Enough that the camber reads as a curve rather than a crease, and
regular enough that a vertex shader could displace it later."""


def build(collection):
    """Build the sails. Returns a dict of named objects."""
    if not params.SAILS_HOISTED:
        return {}

    geometry = rig.layout(deck.height_function())

    main = _build_mainsail(collection, geometry)
    genoa, genoa_surface = _build_genoa(collection, geometry)

    return {
        "mainsail": main,
        "genoa": genoa,
        "sail_number": _build_sail_number(collection, genoa_surface),
    }


# --------------------------------------------------------------------------
# Sail shape
# --------------------------------------------------------------------------


def _lerp(a, b, t):
    return a + (b - a) * t


def _camber(u):
    """The draft profile across a chord: 0 at both ends, 1 at the deepest point.

    A sine raised to a power, which puts the maximum at
    `SAIL_DRAFT_POSITION` and leaves the entry fine and the exit flat -- the
    shape of a sail rather than the shape of an aerofoil, which is a different
    thing and would be wrong here for the same reason a hull section is not an
    ellipse.
    """
    position = params.SAIL_DRAFT_POSITION
    if u <= 0.0 or u >= 1.0:
        return 0.0

    # Remap so the peak lands where it is asked to.
    warped = u ** (0.5 / position) if u < position else 1 - (1 - u) ** (
        0.5 / (1 - position)
    )
    return sin(pi * warped)


def _surface_function(luff, leech):
    """Turn a luff and a leech into `place(u, v)`, a point on the sail.

    `v` runs 0 at the foot to 1 at the head, `u` runs 0 on the luff to 1 on the
    leech. Both sails are the same surface with different edges, which is what
    lets the sail number be laid on either of them without knowing which.

    The camber and the twist both go on as an offset athwartships. That is an
    approximation -- a real sail's draft is normal to its own chord, which up
    near the head is nowhere near horizontal -- and it is the right one here,
    because the chords of both these sails are within a few degrees of horizontal
    over the whole of the part anybody looks at.
    """

    def place(u, v):
        a = luff(v)
        b = leech(v)

        # The chord is the whole distance luff to leech, all three axes. Taken
        # across two of them it came out as the *height* difference between the
        # two ends -- 90 mm on a mainsail whose chords run fore and aft -- and
        # both sails were built with 10 mm of camber in them and looked exactly
        # like what they were, which is a pair of flat triangles.
        chord = hypot(hypot(b[0] - a[0], b[1] - a[1]), b[2] - a[2])
        draft = params.SAIL_DRAFT * chord * (1.0 - 0.35 * v)
        twist = params.SAIL_TWIST * chord * v**1.6

        return (
            _lerp(a[0], b[0], u) - draft * _camber(u) - twist * u,
            _lerp(a[1], b[1], u),
            _lerp(a[2], b[2], u),
        )

    return place


def _build_sail(name, collection, place):
    """Skin a sail's `(u, v)` grid.

    The rows are chords and the columns run luff to leech, in that order, so the
    mesh is a rectangular grid however degenerate the outline gets at the head.
    A sail comes to a point up there and the top row collapses to one vertex; the
    weld pass turns it into a pole, exactly as the hull's stem section does.
    """
    rings = [
        [
            place(u / (CHORD_POINTS - 1), v / (HEIGHT_POINTS - 1))
            for u in range(CHORD_POINTS)
        ]
        for v in range(HEIGHT_POINTS)
    ]

    obj = grid_to_mesh(name, rings, collection)
    shade_smooth(obj, sharp_above_degrees=60.0)
    return obj


# --------------------------------------------------------------------------
# The mainsail
# --------------------------------------------------------------------------


def _build_mainsail(collection, g):
    """Bent on the mast and the boom, with roach in the leech.

    The three corners come off the rig rather than off numbers of their own: the
    tack is at the gooseneck, the head is `MAINSAIL_HOIST` up the mast from the
    lower band, and the clew is at the boom's outer band. Move the boom and the
    sail follows it, which is what has to happen when the boom has just been
    lengthened a foot and dropped half of one.
    """
    y = params.station_to_y

    luff_station = g["mast_aft"] + 0.020
    tack_z = g["boom_z"] + 0.055
    head_z = g["boom_z"] + params.MAINSAIL_HOIST
    clew_station = g["mast_aft"] + params.BOOM_LENGTH - 0.060
    clew_z = g["boom_z"] + params.BOOM_RISE + 0.055

    def luff(v):
        # Straight up the after face of the mast. A real one is cut with luff
        # round to match the mast's bend; this mast does not bend.
        return (0.0, y(luff_station), _lerp(tack_z, head_z, v))

    def leech(v):
        # Head to clew, bulged aft. The roach is what the battens are for and it
        # is most of the difference between a mainsail and a triangle.
        station = _lerp(clew_station, luff_station, v)
        z = _lerp(clew_z, head_z, v)
        roach = params.MAINSAIL_ROACH * sin(pi * v) ** 0.85
        return (0.0, y(station + roach), z)

    place = _surface_function(luff, leech)

    def with_foot_round(u, v):
        """The foot lifts off the boom in the middle, as a loose-footed main
        does. Faded out with height so it is a foot shape and not a wrinkle
        carried up the sail."""
        x, py, z = place(u, v)
        lift = params.MAINSAIL_FOOT_ROUND * sin(pi * u) * max(0.0, 1.0 - v * 4.0)
        return (x, py, z + lift)

    return _build_sail("mainsail", collection, with_foot_round)


# --------------------------------------------------------------------------
# The genoa
# --------------------------------------------------------------------------


def _build_genoa(collection, g):
    """Hanked on the forestay, sheeted to port.

    Its luff lies on the stay rather than beside it -- the same two points
    `rig.py` runs the wire between -- so the sail cannot come adrift from the
    rigging it is set on. That is worth more than it sounds: the forestay's foot
    is at the stemhead and its head is at the masthead, and both of those are
    derived, not given.

    Returns the object and its surface function, because the sail number has to
    be laid on the same surface and asking it is the only way to be sure.
    """
    y = params.station_to_y

    tack = (0.0, y(g["forestay_station"]), g["forestay_z"] + 0.120)
    head = (0.0, y(g["mast_axis"]), g["masthead_z"] - 0.180)

    clew = (
        params.GENOA_CLEW_OFFSET,
        y(params.GENOA_CLEW_STATION),
        tack[2] + params.GENOA_CLEW_ABOVE_TACK,
    )

    def luff(v):
        return tuple(_lerp(tack[i], head[i], v) for i in range(3))

    def leech(v):
        # Clew to head, with the slight hollow a genoa's leech is cut with so it
        # does not hook to windward when it is sheeted in.
        point = [_lerp(clew[i], head[i], v) for i in range(3)]
        hollow = 0.090 * sin(pi * v)
        point[1] += hollow
        return tuple(point)

    place = _surface_function(luff, leech)

    def with_foot_sag(u, v):
        """The foot of an overlapping genoa hangs below the straight line from
        tack to clew -- there is nothing holding it up."""
        x, py, z = place(u, v)
        sag = 0.130 * sin(pi * u) * max(0.0, 1.0 - v * 3.0)
        return (x, py, z - sag)

    return _build_sail("genoa", collection, with_foot_sag), with_foot_sag


# --------------------------------------------------------------------------
# The registration
# --------------------------------------------------------------------------


NUMBER_ANCHOR = (0.30, 0.28)
"""Where on the headsail the number is centred, in the sail's own `(u, v)`.

Low and forward of mid-chord. That is where a genoa carries one -- high enough
to clear the sag in the foot, far enough from the leech not to be lost in the
curl of it, and well below the spreaders -- and on this boat there is a second
reason to keep it forward: a 160% genoa runs a long way past the mast, and
anything laid abaft about 60% of the chord is behind the mainsail from every
angle the camera can reach. Centred at 0.45 the first two characters were gone.

At 0.30 the whole number is forward of the mast on the sail, and reads in full
from abeam and from ahead. From the quarter the mast still crosses the first
character, and that is parallax rather than placement: the sail is cambered half
a metre to leeward there and the mast is on the centreline several metres
nearer the camera, so it projects across cloth it is nowhere near. Clearing it
from that angle too would mean hanging the number off the luff. Photographs of
real boats look like this.
"""


def _build_sail_number(collection, surface):
    """The registration, laid on both faces of the headsail.

    Blender's own font, tessellated to a mesh and then bent onto the sail: the
    glyphs are generated flat and every vertex is put back through the same
    surface function the cloth was built from. So the letters follow the camber,
    and they follow it exactly, because they are asking the sail rather than
    approximating it.

    Sized in *metres* and converted to `(u, v)` locally rather than fitted to a
    patch of parameter space. The two are nothing like each other on a sail: `u`
    runs luff to leech and the chord it spans goes from five metres at the foot
    to nothing at the head, so a number laid out in parameter space comes out
    with whatever aspect ratio the sail happens to have where it was put. The
    local scale is taken by finite difference at the anchor -- how many metres a
    step in `u` is worth, and in `v` -- which is a two-line calculation and is
    right everywhere.

    Both faces carry a copy, each reading the right way round from its own side
    and each standing 4 mm off the cloth. Two copies rather than one because the
    camera path passes the boat down one side and stops on the other, and a sail
    number that is backwards is worse than no sail number at all.
    """
    glyphs = _glyph_mesh(params.SAIL_NUMBER)
    if glyphs is None:
        return None

    (gx0, gx1), (gy0, gy1) = glyphs["bounds"]
    if gx1 <= gx0 or gy1 <= gy0:
        return None

    mid_u, mid_v = NUMBER_ANCHOR
    step = 0.01

    def metres(a, b):
        pa, pb = surface(*a), surface(*b)
        return hypot(hypot(pb[0] - pa[0], pb[1] - pa[1]), pb[2] - pa[2])

    per_u = metres((mid_u - step, mid_v), (mid_u + step, mid_v)) / (2 * step)
    per_v = metres((mid_u, mid_v - step), (mid_u, mid_v + step)) / (2 * step)
    if per_u <= 0.0 or per_v <= 0.0:
        return None

    tall = params.SAIL_NUMBER_HEIGHT
    wide = tall * (gx1 - gx0) / (gy1 - gy0)

    faces = []
    # The sail's `u` runs luff to leech, which is bow to stern. Text reads
    # forward from its first character, so `u` has to *decrease* across the
    # string for the copy on the starboard side and increase for the one to
    # port -- which is also the two copies' only difference.
    for run, lift in ((-1, 0.004), (1, -0.004)):
        verts = []
        for x, z in glyphs["verts"]:
            u = mid_u + run * (wide / per_u) * ((x - gx0) / (gx1 - gx0) - 0.5)
            v = mid_v + (tall / per_v) * ((z - gy0) / (gy1 - gy0) - 0.5)
            point = surface(u, v)
            verts.append((point[0] + lift, point[1], point[2]))

        mesh = bpy.data.meshes.new(f"sail_number_{run}")
        mesh.from_pydata(verts, [], glyphs["faces"])
        mesh.validate(verbose=False)

        obj = bpy.data.objects.new(mesh.name, mesh)
        collection.objects.link(obj)
        faces.append(obj)

    return join(faces, "sail_number")


def _glyph_mesh(text):
    """Tessellate a string into flat polygons: `verts` in the x-z plane, `faces`,
    and the bounding box.

    Built through a font curve and thrown away again. Blender's text objects are
    curves, and `to_mesh` on an evaluated one gives the filled outlines without
    needing an operator or a selection -- which matters, because this runs
    headless and operators there depend on context that does not exist.
    """
    curve = bpy.data.curves.new("sail_number", type="FONT")
    curve.body = text
    curve.fill_mode = "BOTH"
    curve.extrude = 0.0
    curve.resolution_u = 3

    obj = bpy.data.objects.new("sail_number_src", curve)
    bpy.context.scene.collection.objects.link(obj)

    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()

    verts = [(v.co.x, v.co.y) for v in mesh.vertices]
    faces = [tuple(p.vertices) for p in mesh.polygons]

    evaluated.to_mesh_clear()
    bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.curves.remove(curve)

    if not verts or not faces:
        print("[sails] the font produced no geometry -- no sail number")
        return None

    xs = [v[0] for v in verts]
    ys = [v[1] for v in verts]
    return {
        "verts": verts,
        "faces": faces,
        "bounds": ((min(xs), max(xs)), (min(ys), max(ys))),
    }

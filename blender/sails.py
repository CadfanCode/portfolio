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
from lib.mesh import cap_loop, grid_to_mesh, join, recalc_normals, shade_smooth
from lib.sweep import circle, sweep_rings


CHORD_POINTS = 25
HEIGHT_POINTS = 45
"""The grid. Enough that the camber reads as a curve rather than a crease, and
fine enough that the vertex shader anticipated here -- see `src/scene/Boat.tsx`
-- has real cloth to displace: a travelling luff wave and a leech flutter are
only as smooth as the mesh carrying them, and at the old 13x15 the flutter came
out faceted, a row of flat panels shivering rather than cloth. 25x45 is about
1100 vertices a sail, which the leech (the trailing edge, where the flutter
lives and where the head runs the grid down to a point) spends most of on
height. Still cheap: the two sails together are a rounding error against the
hull, and nothing else in this file reads the grid -- the number, battens and
headboard all sample the surface function, not its tessellation, so they are
unaffected by the count moving."""


def build(collection):
    """Build the sails. Returns a dict of named objects."""
    if not params.SAILS_HOISTED:
        return {}

    geometry = rig.layout(deck.height_function())

    main, main_surface = _build_mainsail(collection, geometry)
    genoa, genoa_surface = _build_genoa(collection, geometry)

    return {
        "mainsail": main,
        "genoa": genoa,
        "sail_number": _build_sail_number(collection, main_surface),
        "mainsail_headboard": _build_headboard(collection, main_surface),
        "mainsail_battens": _build_battens(collection, main_surface),
        "sail_cringles": _build_cringles(collection, main_surface, genoa_surface),
        "boltropes": _build_boltropes(collection, main_surface, genoa_surface),
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


def _surface_function(luff, leech, draft_fraction=None, twist_fraction=None):
    """Turn a luff and a leech into `place(u, v)`, a point on the sail.

    `v` runs 0 at the foot to 1 at the head, `u` runs 0 on the luff to 1 on the
    leech. Both sails are the same surface with different edges, which is what
    lets the sail number be laid on either of them without knowing which.

    The camber and the twist both go on as an offset athwartships. That is an
    approximation -- a real sail's draft is normal to its own chord, which up
    near the head is nowhere near horizontal -- and it is the right one here,
    because the chords of both these sails are within a few degrees of horizontal
    over the whole of the part anybody looks at.

    `draft_fraction`/`twist_fraction` default to the shared `SAIL_DRAFT`/
    `SAIL_TWIST` but can be overridden per sail: the overlapping genoa is cut and
    sets fuller than the main, and has to bag to leeward of the spreader tips it
    sweeps across rather than inboard of them, where the tips would spear it.
    """
    draft_fraction = params.SAIL_DRAFT if draft_fraction is None else draft_fraction
    twist_fraction = params.SAIL_TWIST if twist_fraction is None else twist_fraction

    def place(u, v):
        a = luff(v)
        b = leech(v)

        # The chord is the whole distance luff to leech, all three axes. Taken
        # across two of them it came out as the *height* difference between the
        # two ends -- 90 mm on a mainsail whose chords run fore and aft -- and
        # both sails were built with 10 mm of camber in them and looked exactly
        # like what they were, which is a pair of flat triangles.
        chord = hypot(hypot(b[0] - a[0], b[1] - a[1]), b[2] - a[2])
        draft = draft_fraction * chord * (1.0 - 0.35 * v)
        twist = twist_fraction * chord * v**1.6

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

    return _build_sail("mainsail", collection, with_foot_round), with_foot_round


# --------------------------------------------------------------------------
# The genoa
# --------------------------------------------------------------------------


def genoa_tack(g):
    """Where the genoa's tack sits: at the stemhead end of the forestay, lifted
    clear of the pulpit block it lands next to.

    Public alongside `genoa_clew` for the same reason: a rope reeved from
    somewhere other than where the sail actually is comes adrift from it the
    first time either is re-authored.
    """
    return (0.0, params.station_to_y(g["forestay_station"]), g["forestay_z"] + 0.120)


def genoa_clew(g):
    """Where the genoa's clew sits, in world space: aft, up, and out to port.

    Public because `fittings.py` reeves the genoa sheet from exactly this
    point. A sheet given the clew's coordinates a second time is a sheet that
    comes adrift from the sail the next time `GENOA_CLEW_*` moves.
    """
    tack = genoa_tack(g)
    return (
        params.GENOA_CLEW_OFFSET,
        params.station_to_y(params.GENOA_CLEW_STATION),
        tack[2] + params.GENOA_CLEW_ABOVE_TACK,
    )


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

    tack = genoa_tack(g)
    head = (0.0, y(g["mast_axis"]), g["masthead_z"] - 0.180)
    clew = genoa_clew(g)

    def luff(v):
        return tuple(_lerp(tack[i], head[i], v) for i in range(3))

    def leech(v):
        # Clew to head, with the slight hollow a genoa's leech is cut with so it
        # does not hook to windward when it is sheeted in.
        point = [_lerp(clew[i], head[i], v) for i in range(3)]
        hollow = 0.090 * sin(pi * v)
        point[1] += hollow
        return tuple(point)

    place = _surface_function(
        luff, leech, draft_fraction=params.GENOA_DRAFT, twist_fraction=params.GENOA_TWIST
    )

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


NUMBER_ANCHOR = (0.46, 0.52)
"""Where on the mainsail the number is centred, in the sail's own `(u, v)`.

High and just forward of mid-chord: `v` above 0.5 puts it in the upper half of
the sail, above the boom and the worst of the crew working the cockpit under
it, and `u` at 0.42 keeps the whole string forward of the leech and clear of
the roach -- which curls away from a straight leech line by up to 155 mm here
(`MAINSAIL_ROACH`) and would eat the last character of anything laid closer to
1.0. It is not centred on the chord, because the chord itself narrows going up
the sail and centring on it at every height would walk the number aft as it
climbed; anchored at a single `(u, v)` it stays put on one point of the cloth
the way a sail number sewn to a real sail does.

`v` was 0.62 to begin with and came down to 0.52 for a reason worth recording:
a mainsail is a triangle, so the higher the number goes the less cloth there is
to put it on. At 0.62 the string was 1.83 m long across a chord of about 1 m,
and it did not fail by looking cramped -- it ran straight off the luff, past
the mast, and hung over the genoa beyond, where it read as a second ghost
number on the wrong sail. The height limit below is what actually guarantees it
fits; this is what keeps the limit from having to shrink the number to nothing.

This replaced a genoa placement low and forward on the headsail, which existed
because a 160% genoa runs a long way past the mast and there was nowhere else
on it the number would read from every angle. The mainsail has no mast running
through the middle of it, so the constraint that shaped that placement --
staying clear of the rig's own silhouette -- does not apply here, and the
number can go where a mainsail's actually does.
"""


def _build_sail_number(collection, surface):
    """The registration, laid on both faces of the mainsail.

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
    and each standing off the cloth along the cloth's own normal. Two copies
    rather than one because the camera path passes the boat down one side and
    stops on the other, and a sail number that is backwards is worse than no
    sail number at all.

    The normal is the part that has to be computed rather than assumed. Lifting
    the glyphs along world X instead -- which is what this did first -- works
    only where the sail happens to stand square athwartships, and a mainsail
    sheeted in with camber and twist in it does that nowhere. Everywhere else a
    4 mm sideways step is partly *along* the cloth rather than off it, so the
    two copies interpenetrate the sail and each other: the render came out
    reading `SWE 2878`, the far side's mirrored glyphs showing through the near
    side's and turning the 5 into an 8. A number that cannot be trusted to say
    what it says is worse than the backwards one this was guarding against.
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

    # Fit it to the cloth. `SAIL_NUMBER_HEIGHT` says how big a sail number ought
    # to be; the sail says how big one can be, and on a triangle those two stop
    # agreeing somewhere below the head. Rather than trust an anchor to be low
    # enough, measure the chord under the number and shrink to fit if it is not
    # -- eight characters at 300 mm is 1.8 m of string, and there is nowhere on
    # a 7.6 m boat's mainsail above half height that will take that.
    #
    # 0.72 of the chord, not all of it: a number that touches both the luff and
    # the leech has been laid on the cloth by a machine. Real ones sit inside a
    # margin, because the luff is full of slides and the leech is where the sail
    # is stitched and stretched most.
    chord = metres((0.0, mid_v), (1.0, mid_v))
    limit = 0.72 * chord
    if wide > limit > 0.0:
        tall *= limit / wide
        wide = limit

    def normal(u, v):
        """The cloth's outward normal at a point, by finite difference.

        Signed so that it always points to starboard. The cross product's own
        sign depends on which way `u` and `v` happen to run, which is a
        property of the sail's parameterisation and not of the boat; pinning it
        to a side here means the two copies below differ only in `run`.
        """
        p = surface(u, v)
        du = [a - b for a, b in zip(surface(u + step, v), p)]
        dv = [a - b for a, b in zip(surface(u, v + step), p)]
        n = (
            du[1] * dv[2] - du[2] * dv[1],
            du[2] * dv[0] - du[0] * dv[2],
            du[0] * dv[1] - du[1] * dv[0],
        )
        length = hypot(hypot(n[0], n[1]), n[2])
        if length <= 1e-9:
            return p, (1.0, 0.0, 0.0)
        sign = -1.0 if n[0] < 0.0 else 1.0
        return p, tuple(sign * c / length for c in n)

    # 6 mm, not the 4 this started with. The cloth is a zero-thickness sheet
    # carrying a copy on each side, so the two are only ever 12 mm apart, and
    # that gap is the entire defence against them z-fighting through each
    # other where the sail is most curved.
    stand_off = 0.006

    faces = []
    # The sail's `u` runs luff to leech, which is bow to stern. Text reads
    # forward from its first character, so `u` has to *decrease* across the
    # string for the copy on the starboard side and increase for the one to
    # port -- which is also the two copies' only difference.
    for run in (-1, 1):
        verts = []
        for x, z in glyphs["verts"]:
            u = mid_u + run * (wide / per_u) * ((x - gx0) / (gx1 - gx0) - 0.5)
            v = mid_v + (tall / per_v) * ((z - gy0) / (gy1 - gy0) - 0.5)
            point, out = normal(u, v)
            lift = stand_off * -run
            verts.append(tuple(p + lift * c for p, c in zip(point, out)))

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


# --------------------------------------------------------------------------
# Sail furniture: battens, headboard, cringles, boltrope
#
# A sail built from three shape numbers reads as cloth from across the water
# and as a diagram from anywhere closer, because nothing in it says how the
# thing is actually made -- a real sail is stitched, corners are reinforced
# to take a load, and the leech is held straight by battens rather than by
# hope. All four are built the same way: sampled off the sail's own surface
# function rather than laid out in world space, so a piece of hardware cannot
# end up floating off the cloth it belongs to the next time the camber or the
# twist changes.
# --------------------------------------------------------------------------

_HARDWARE_LIFT = 0.004
"""How far every piece of sail furniture stands off the cloth -- the same
offset the sail number uses, and for the same reason: two coincident faces
z-fight, and this is the smallest gap that does not."""


def _unit(v):
    length = hypot(hypot(v[0], v[1]), v[2])
    return tuple(c / length for c in v) if length > 1e-9 else (0.0, 0.0, 1.0)


def _cross(a, b):
    return (
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    )


def _surface_frame(surface, u, v, step=0.01):
    """A local frame at a point on a sail: the point itself, and two unit
    tangents along increasing `u` and `v`, taken by finite difference -- the
    same trick the sail number's local scale uses.

    Not a true differential frame -- `eu` and `ev` are not generally
    orthogonal, since `u` and `v` are not an orthogonal parametrisation of the
    surface. Good enough to glue small flat hardware to the cloth; nothing
    here needs more than that.
    """
    origin = surface(u, v)
    u2, su = (u + step, 1.0) if u + step <= 1.0 else (u - step, -1.0)
    v2, sv = (v + step, 1.0) if v + step <= 1.0 else (v - step, -1.0)
    eu = _unit(tuple((surface(u2, v)[k] - origin[k]) * su for k in range(3)))
    ev = _unit(tuple((surface(u, v2)[k] - origin[k]) * sv for k in range(3)))
    return origin, eu, ev


def _ring(collection, name, surface, u, v, radius, tube_radius, segments=14):
    """A small ring laid flat against the cloth: a cringle, standing proud of
    it -- built in the surface's own local plane rather than perpendicular to
    it, because an edge-on grommet is a highlight nobody on this camera path
    ever sees, and a reinforcing ring lying against the sail is what one
    actually reads as from more than a boat's length away.
    """
    origin, eu, ev = _surface_frame(surface, u, v)
    normal = _unit(_cross(eu, ev))
    centre = tuple(origin[k] + normal[k] * _HARDWARE_LIFT for k in range(3))

    path = []
    for i in range(segments + 1):
        angle = 2 * pi * i / segments
        c, s = cos(angle), sin(angle)
        path.append(
            tuple(centre[k] + eu[k] * radius * c + ev[k] * radius * s for k in range(3))
        )

    rings = sweep_rings(circle(tube_radius, 8), path)
    obj = grid_to_mesh(name, rings, collection, close_rings=True)
    recalc_normals(obj)
    return obj


CRINGLES = (
    ("tack", (0.0, 0.0), 0.016),
    ("clew", (1.0, 0.0), 0.020),
    # The head cringle sits just below the head itself: at v = 1 the surface
    # function's luff and leech converge to the same point (`_build_sail`'s
    # own note on why the top row of the grid collapses to a pole), and a ring
    # built exactly there has no local plane to lie in.
    ("head", (0.5, 0.965), 0.014),
)


def _build_cringles(collection, main_surface, genoa_surface):
    """The three working corners of both sails, reinforced -- the load path
    everything else in this section either hangs from or pulls against."""
    rings = [
        _ring(collection, f"{tag}_{name}_cringle", surface, u, v, radius, 0.0035)
        for (tag, surface) in (("main", main_surface), ("genoa", genoa_surface))
        for (name, (u, v), radius) in CRINGLES
    ]
    return join(rings, "sail_cringles")


def _boltrope(collection, name, surface, count=14, tube_radius=0.004):
    """The rope sewn into the luff, tack to head.

    Run up the cloth a little off the luff line itself (`u = 0.015`) rather
    than on it: the luff line *is* the mast track or the forestay, and a rope
    modelled exactly on top of the spar it runs beside is a rope indistinguishable
    from the spar. A boltrope is proud of the sail on the sail's own side of it.
    """
    path = [surface(0.015, i / (count - 1)) for i in range(count)]
    rings = sweep_rings(circle(tube_radius, 8), path)
    obj = grid_to_mesh(name, rings, collection, close_rings=True)
    recalc_normals(obj)
    return obj


def _build_boltropes(collection, main_surface, genoa_surface):
    return join(
        [
            _boltrope(collection, "main_boltrope", main_surface),
            _boltrope(collection, "genoa_boltrope", genoa_surface),
        ],
        "boltropes",
    )


BATTENS = (
    # (v, reach) -- height up the leech, and how far the pocket runs in as a
    # fraction of the chord there. Longest a third of the way up, where the
    # roach is fullest and needs the most support; shortest at the head, where
    # both the roach and the chord itself are running out.
    (0.30, 0.34),
    (0.50, 0.38),
    (0.68, 0.34),
    (0.85, 0.24),
)


def _batten(collection, name, surface, v, reach, segments=6, radius=0.006):
    """One batten, run in from just short of the leech and following the
    sail's own camber rather than a straight chord -- a real batten bends with
    the cloth it is stiffening, it does not fight it flat."""
    us = [_lerp(0.99, 1.0 - reach, i / segments) for i in range(segments + 1)]
    path = [surface(u, v) for u in us]
    rings = sweep_rings(circle(radius, 8), path)
    obj = grid_to_mesh(name, rings, collection, close_rings=True)
    cap_loop(obj, rings[0])
    cap_loop(obj, list(reversed(rings[-1])))
    recalc_normals(obj)
    return obj


def _build_battens(collection, main_surface):
    """Battens in their pockets, mainsail only -- a genoa this size is not
    full-length enough to carry any, and would not have a leech straight
    enough to need one if it did."""
    battens = [
        _batten(collection, f"batten_{i}", main_surface, v, reach)
        for i, (v, reach) in enumerate(BATTENS)
    ]
    return join(battens, "mainsail_battens")


def _build_headboard(collection, surface, half_u=0.11, v0=0.945, v1=0.975, thickness=0.006):
    """The rigid plate at the head of the mainsail.

    Built a little below the head itself for the reason the head cringle is:
    the surface function's luff and leech meet at a single point at `v = 1`,
    and a plate spanning `u` needs a real chord to span. A trapezoid rather
    than a rectangle, because the head above it narrows to that point and a
    square-cornered board would stand outside the sail it is sewn to.
    """
    outline = [
        (0.5 - half_u, v0),
        (0.5 + half_u, v0),
        (0.5 + half_u * 0.55, v1),
        (0.5 - half_u * 0.55, v1),
    ]
    origin, eu, ev = _surface_frame(surface, 0.5, (v0 + v1) / 2)
    normal = _unit(_cross(eu, ev))
    lift = tuple(normal[k] * thickness for k in range(3))

    top = [surface(u, v) for (u, v) in outline]
    rings = [
        [tuple(p[k] + lift[k] for k in range(3)) for p in top],
        [tuple(p[k] - lift[k] for k in range(3)) for p in top],
    ]

    obj = grid_to_mesh("mainsail_headboard", rings, collection, close_rings=True)
    cap_loop(obj, rings[0])
    cap_loop(obj, list(reversed(rings[1])))
    recalc_normals(obj)
    shade_smooth(obj, sharp_above_degrees=30.0)
    return obj

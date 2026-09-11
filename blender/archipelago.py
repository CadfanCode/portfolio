"""
The Stockholm-archipelago prop kit: pines, birch and juniper, shore rock,
two red houses, a sauna, a boathouse, a jetty, a dinghy, a sea mark, a
flagpole.

Unrelated to the Maxi 77 -- this is a second, independent model built by the
same pipeline and exported as its own GLB, `archipelago-kit.glb`. The app
scatters instances of each part around the boat as background scenery, so the
whole kit has to clear a budget the boat never had to: under 200 KB
uncompressed, no draco, no meshopt (`params.py`, "Archipelago prop kit"). That
rules out anything lofted or textured. Every part here is a handful of cones,
boxes and faceted icospheres built directly with `bmesh`, flat-coloured, and
it stays that way on purpose -- a pine at 150 m is a silhouette, not a place
to spend triangles.

Sixteen named root objects, each with its origin at its base centre and its
front facing Blender +Y -- which the glTF exporter's `-y -> z` axis mapping
turns into `-Z` in the export, matching the boat's own bow convention
(`params.py`, "Units and axes"). That is what lets the scatter code in
`src/scene/archipelago/props.tsx` place an instance with nothing but a
position and a rotation about Y. Where "front" is not a meaningful idea for a
part -- a boulder, a rock stack, a juniper bush -- the convention is honoured
anyway (base at the origin) but not relied on.

The second batch of eight -- the two shore rocks, the juniper, the birch, the
second cottage, the sauna, the dinghy, the rock cluster -- exists because bare
skerries dressed with nothing but pines and houses read as sand dunes with
trees on them: an inner-archipelago skerry is granite first, and the rocks
that say so were the single biggest gap in the original eight.
"""

import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Matrix  # noqa: E402

import params  # noqa: E402
from lib.mesh import mirror_x, shade_smooth  # noqa: E402


# --- Materials --------------------------------------------------------------
#
# A small, flat-coloured palette, shared across parts so the instanced draw
# calls stay few (Task 5's own constraint). Nothing here is textured: these
# are seen at 70-180 m, where a normal map buys nothing and a colour image is
# just bytes the 200 KB budget cannot spare.


def _flat(name, colour, roughness=0.75, metallic=0.0):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = material.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*colour, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    return material


def _materials():
    return {
        # Bark: two conifer greens would double the draw calls for a
        # difference nobody sees at range, so every pine crown shares one.
        "bark": _flat("kit_bark", (0.27, 0.20, 0.15), roughness=0.88),
        "pine_green": _flat("kit_pine_green", (0.086, 0.150, 0.088), roughness=0.85),
        # Falu red, the one colour this whole kit exists to get right.
        "falu_red": _flat("kit_falu_red", (0.482, 0.231, 0.180), roughness=0.72),
        # White corner boards and window trim -- what makes the red read as
        # Swedish rather than as a generic red box (Task 5's own brief).
        "trim_white": _flat("kit_trim_white", (0.92, 0.91, 0.87), roughness=0.55),
        "roof_grey": _flat("kit_roof_grey", (0.185, 0.185, 0.195), roughness=0.68),
        "window_dark": _flat("kit_window_dark", (0.03, 0.04, 0.05), roughness=0.25),
        "granite": _flat("kit_granite", (0.55, 0.52, 0.49), roughness=0.90),
        "timber": _flat("kit_timber", (0.36, 0.29, 0.21), roughness=0.80),
        "pole_white": _flat("kit_pole_white", (0.88, 0.88, 0.86), roughness=0.40),
        "flag_blue": _flat("kit_flag_blue", (0.020, 0.235, 0.475), roughness=0.60),
        "flag_yellow": _flat("kit_flag_yellow", (0.965, 0.760, 0.115), roughness=0.55),
        # Juniper scrub: darker and pulled toward blue-green next to the
        # pines' own green, which is what keeps a mixed skerry treeline from
        # reading as one shade of conifer repeated at ground level.
        "juniper": _flat("kit_juniper", (0.075, 0.120, 0.115), roughness=0.82),
        # Birch: near-white bark and a yellow-green leaf, both deliberately
        # far from the pine palette -- birch among conifers is the detail
        # that makes a Baltic treeline read as Swedish rather than generic.
        "birch_bark": _flat("kit_birch_bark", (0.82, 0.80, 0.76), roughness=0.55),
        "birch_leaf": _flat("kit_birch_leaf", (0.415, 0.520, 0.190), roughness=0.80),
        # The one painted strake on the dinghy -- a faded teal, the commonest
        # colour on a Baltic rowing boat after bare timber itself.
        "boat_paint": _flat("kit_boat_paint", (0.086, 0.300, 0.290), roughness=0.55),
    }


def _new_object(name, collection, bm):
    """Turn an in-progress bmesh into a linked, named object."""
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.validate(verbose=False)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    return obj


def _add_cone(bm, radius1, radius2, depth, segments, matrix):
    """A cone or tapered cylinder, base and apex on the local Z axis."""
    bmesh.ops.create_cone(
        bm,
        cap_ends=True,
        cap_tris=False,
        segments=segments,
        radius1=radius1,
        radius2=radius2,
        depth=depth,
        matrix=matrix,
    )


def _add_box(bm, size_x, size_y, size_z, matrix):
    """An axis-aligned box, `size` full extents, transformed by `matrix`."""
    ret = bmesh.ops.create_cube(bm, size=1.0)
    verts = ret["verts"]
    scale = Matrix.Diagonal((size_x, size_y, size_z, 1.0))
    bmesh.ops.transform(bm, verts=verts, matrix=matrix @ scale)


def _add_faceted_rock(bm, *, cx, cy, radius_xy, radius_z, jitter, seed, rot_z=0.0):
    """A faceted rock: an icosahedron, vertex-jittered and squashed flat.

    An icosahedron (`subdivisions=1`, 12 verts, 20 faces) is angular by
    construction -- exactly the "faceted" look asked for, and cheaper than
    smoothing a sphere and then trying to break it back up. Left flat-shaded
    on purpose; granite has hard faces, not a fair curved one (contrast
    `shade_smooth` on the pines and houses).

    The lowest vertex is pulled down to local z=0 so the rock sits flush on
    whatever it is placed on, matching the kit's base-at-origin convention.
    `seed` makes the jitter reproducible -- the same call always builds the
    same rock.
    """
    rng = random.Random(seed)
    ret = bmesh.ops.create_icosphere(
        bm, subdivisions=1, radius=1.0, matrix=Matrix.Identity(4)
    )
    verts = ret["verts"]
    for vert in verts:
        scale = 1.0 + rng.uniform(-jitter, jitter)
        vert.co.x *= scale * radius_xy
        vert.co.y *= scale * radius_xy
        vert.co.z *= scale * radius_z
    min_z = min(vert.co.z for vert in verts)
    matrix = Matrix.Translation((cx, cy, -min_z)) @ Matrix.Rotation(
        math.radians(rot_z), 4, "Z"
    )
    bmesh.ops.transform(bm, verts=verts, matrix=matrix)
    return verts


# --- Pines --------------------------------------------------------------


def _build_pine(
    collection,
    name,
    material_bark,
    material_crown,
    *,
    height,
    crown_diameter,
    layers,
    trunk_fraction,
    trunk_segments=1,
    lean_deg=0.0,
    seed,
):
    """A Scots pine: a bare, tapered trunk and a layered, irregular crown.

    Not three identical cones at different scales -- the layers vary in
    radius, height and horizontal offset from a seeded RNG, so no two of the
    kit's three pine variants (or two instances of the same one, once the app
    varies `scale`) read as the same tree stamped out again.
    """
    rng = random.Random(seed)
    bm = bmesh.new()

    trunk_height = height * trunk_fraction
    crown_height = height - trunk_height
    base_radius = height * 0.020
    lean = math.tan(math.radians(lean_deg))

    x = y = 0.0
    z = 0.0
    seg_height = trunk_height / trunk_segments
    for i in range(trunk_segments):
        r0 = base_radius * (1.0 - i / trunk_segments * 0.55)
        r1 = base_radius * (1.0 - (i + 1) / trunk_segments * 0.55)
        # A gnarled trunk is not straight: each segment kinks a little more
        # than a true bend would, which is what reads as "gnarled" rather
        # than "leaning" at a distance.
        kink = rng.uniform(-0.15, 0.15) * lean_deg / 20.0 if lean_deg else 0.0
        matrix = Matrix.Translation((x, y, z + seg_height / 2)) @ Matrix.Rotation(
            math.radians(kink * 8), 4, "Y"
        )
        _add_cone(bm, r0, r1, seg_height, 6, matrix)
        x += lean * seg_height
        z += seg_height

    crown_base_x, crown_base_y, crown_base_z = x, y, z

    for i in range(layers):
        frac = i / max(1, layers - 1)
        layer_height = crown_height / layers * 1.55
        layer_z = crown_base_z + frac * (crown_height - layer_height * 0.6)
        radius = crown_diameter / 2 * (1.0 - 0.5 * frac) * rng.uniform(0.85, 1.05)
        jitter_x = crown_base_x + lean * (layer_z - crown_base_z) + rng.uniform(
            -radius, radius
        ) * 0.30
        jitter_y = crown_base_y + rng.uniform(-radius, radius) * 0.30
        tilt_x = rng.uniform(-8.0, 8.0)
        tilt_y = rng.uniform(-8.0, 8.0)
        matrix = (
            Matrix.Translation((jitter_x, jitter_y, layer_z + layer_height / 2))
            @ Matrix.Rotation(math.radians(tilt_x), 4, "X")
            @ Matrix.Rotation(math.radians(tilt_y), 4, "Y")
        )
        segments = 6 if layers <= 3 else 7
        _add_cone(bm, radius, radius * 0.12, layer_height, segments, matrix)

    obj = _new_object(name, collection, bm)
    obj.data.materials.append(material_bark)
    obj.data.materials.append(material_crown)
    # The trunk segments were added first, so their faces sit at the front of
    # the polygon list; everything after `trunk_segments` worth of cones is
    # crown. Each `create_cone` call at 6-7 segments with caps writes a fixed
    # number of faces, which is what makes this indexing safe rather than
    # fragile: it is arithmetic on a shape this module itself controls.
    faces_per_trunk_cone = 6 + 2  # sides + two n-gon caps
    trunk_faces = trunk_segments * faces_per_trunk_cone
    for i, polygon in enumerate(obj.data.polygons):
        polygon.material_index = 0 if i < trunk_faces else 1
    shade_smooth(obj, sharp_above_degrees=35.0)
    return obj


def _build_pines(collection, materials):
    pine_a = _build_pine(
        collection,
        "pine_a",
        materials["bark"],
        materials["pine_green"],
        height=params.KIT_PINE_A_HEIGHT,
        crown_diameter=params.KIT_PINE_A_CROWN,
        layers=4,
        trunk_fraction=params.KIT_PINE_TRUNK_FRACTION,
        trunk_segments=1,
        lean_deg=0.0,
        seed=1,
    )
    pine_b = _build_pine(
        collection,
        "pine_b",
        materials["bark"],
        materials["pine_green"],
        height=params.KIT_PINE_B_HEIGHT,
        crown_diameter=params.KIT_PINE_B_CROWN,
        layers=5,
        trunk_fraction=params.KIT_PINE_TRUNK_FRACTION,
        trunk_segments=1,
        lean_deg=0.0,
        seed=2,
    )
    pine_stunted = _build_pine(
        collection,
        "pine_stunted",
        materials["bark"],
        materials["pine_green"],
        height=params.KIT_PINE_STUNTED_HEIGHT,
        crown_diameter=params.KIT_PINE_STUNTED_CROWN,
        layers=3,
        trunk_fraction=0.40,
        trunk_segments=3,
        lean_deg=22.0,
        seed=3,
    )
    return pine_a, pine_b, pine_stunted


# --- Rocks ------------------------------------------------------------------
#
# Bare skerries without shore rock read as sand dunes, not granite -- the
# single most important gap the pines and houses alone left in the kit.


def _build_boulder(collection, name, materials, *, diameter, height_fraction, seed):
    """A single glacial erratic or shelf rock -- one faceted icosahedron,
    sized and squashed by `diameter` and `height_fraction`."""
    bm = bmesh.new()
    _add_faceted_rock(
        bm,
        cx=0.0,
        cy=0.0,
        radius_xy=diameter / 2,
        radius_z=diameter * height_fraction / 2,
        jitter=params.KIT_ROCK_FACET_JITTER,
        seed=seed,
    )
    obj = _new_object(name, collection, bm)
    obj.data.materials.append(materials["granite"])
    return obj


def _build_rock_stack(collection, materials):
    """Three or four smaller stones on a common footprint -- a cheap way to
    break up a shoreline with a single instance rather than four."""
    rng = random.Random(21)
    bm = bmesh.new()
    footprint = params.KIT_ROCK_STACK_FOOTPRINT
    for i in range(4):
        radius = rng.uniform(0.35, 0.60)
        angle = rng.uniform(0.0, 360.0)
        dist = rng.uniform(0.0, footprint / 2 - radius * 0.6)
        cx = dist * math.cos(math.radians(angle))
        cy = dist * math.sin(math.radians(angle))
        _add_faceted_rock(
            bm,
            cx=cx,
            cy=cy,
            radius_xy=radius,
            radius_z=radius * rng.uniform(0.75, 1.0),
            jitter=params.KIT_ROCK_FACET_JITTER,
            seed=100 + i,
            rot_z=rng.uniform(0.0, 360.0),
        )
    obj = _new_object("rock_stack", collection, bm)
    obj.data.materials.append(materials["granite"])
    return obj


# --- Scrub and birch ---------------------------------------------------------


def _build_juniper(collection, materials):
    """Low, dark, rounded scrub -- a handful of squashed, jittered lobes with
    no visible trunk, unlike everything else woody in the kit."""
    rng = random.Random(31)
    bm = bmesh.new()
    height = params.KIT_JUNIPER_HEIGHT
    spread = params.KIT_JUNIPER_SPREAD
    for _ in range(6):
        radius = spread / 2 * rng.uniform(0.5, 0.8)
        cx = rng.uniform(-spread * 0.22, spread * 0.22)
        cy = rng.uniform(-spread * 0.22, spread * 0.22)
        cz = height * rng.uniform(0.35, 0.85)
        radius_z = radius * rng.uniform(0.65, 0.9)
        ret = bmesh.ops.create_icosphere(
            bm, subdivisions=1, radius=1.0, matrix=Matrix.Identity(4)
        )
        verts = ret["verts"]
        for vert in verts:
            vert.co.x *= radius
            vert.co.y *= radius
            vert.co.z *= radius_z
        bmesh.ops.transform(bm, verts=verts, matrix=Matrix.Translation((cx, cy, cz)))
    # However the lobes landed, the lowest point of the lowest one becomes
    # the base -- the kit's usual origin-at-base convention.
    min_z = min(vert.co.z for vert in bm.verts)
    bmesh.ops.translate(bm, verts=list(bm.verts), vec=(0.0, 0.0, -min_z))
    obj = _new_object("juniper", collection, bm)
    obj.data.materials.append(materials["juniper"])
    shade_smooth(obj, sharp_above_degrees=45.0)
    return obj


def _add_birch_flecks(collection, obj, materials, *, trunk_height, base_radius):
    """The dark lenticel flecks on a birch trunk -- a handful of small dark
    tabs stuck to the bark, radially placed, standing in for what would
    otherwise need a bark texture (none of this kit is textured)."""
    rng = random.Random(43)
    bm = bmesh.new()
    for _ in range(6):
        z = rng.uniform(trunk_height * 0.15, trunk_height * 0.9)
        angle = rng.uniform(0.0, 360.0)
        r = base_radius * (1.0 - z / trunk_height * 0.4) + 0.01
        cx = r * math.cos(math.radians(angle))
        cy = r * math.sin(math.radians(angle))
        matrix = Matrix.Translation((cx, cy, z)) @ Matrix.Rotation(
            math.radians(angle + 90.0), 4, "Z"
        )
        _add_box(bm, 0.11, 0.02, 0.16, matrix)
    flecks = _new_object(f"{obj.name}_flecks", collection, bm)
    _join_part(obj, flecks, materials["bark"])


def _build_birch(collection, materials):
    """A downy birch: a slim, kinked white trunk with dark flecks, and a
    looser, rounder crown of overlapping lobes rather than the pines' tight,
    layered cones. Mixed in with the pines, this is what makes a treeline
    read as Swedish rather than as generic conifer forest."""
    rng = random.Random(41)
    bm = bmesh.new()

    height = params.KIT_BIRCH_HEIGHT
    trunk_height = height * params.KIT_BIRCH_TRUNK_FRACTION
    crown_height = height - trunk_height
    base_radius = height * params.KIT_BIRCH_TRUNK_RADIUS_FRACTION

    trunk_segments = 3
    x = y = z = 0.0
    seg_height = trunk_height / trunk_segments
    for i in range(trunk_segments):
        r0 = base_radius * (1.0 - i / trunk_segments * 0.45)
        r1 = base_radius * (1.0 - (i + 1) / trunk_segments * 0.45)
        kink = rng.uniform(-6.0, 6.0)
        matrix = Matrix.Translation((x, y, z + seg_height / 2)) @ Matrix.Rotation(
            math.radians(kink), 4, "Y"
        )
        _add_cone(bm, r0, r1, seg_height, 6, matrix)
        x += math.tan(math.radians(kink)) * seg_height * 0.3
        z += seg_height
    trunk_faces = trunk_segments * (6 + 2)  # sides + two n-gon caps, per cone

    crown_base_x, crown_base_y, crown_base_z = x, y, z
    crown_diameter = params.KIT_BIRCH_CROWN
    n_lobes = 5
    for i in range(n_lobes):
        frac = i / max(1, n_lobes - 1)
        # Lobes shrink toward the top, and their own radius is folded into
        # `lobe_z` below, so the crown's apex lands close to `height` rather
        # than height-plus-a-lobe-radius above it.
        radius = crown_diameter / 2 * rng.uniform(0.45, 0.70) * (1.0 - 0.30 * frac)
        radius_z = radius * rng.uniform(0.65, 0.85)
        lobe_z = crown_base_z + crown_height * (0.20 + frac * 0.75)
        jitter_x = crown_base_x + rng.uniform(-radius, radius) * 0.35
        jitter_y = crown_base_y + rng.uniform(-radius, radius) * 0.35
        ret = bmesh.ops.create_icosphere(
            bm, subdivisions=1, radius=1.0, matrix=Matrix.Identity(4)
        )
        verts = ret["verts"]
        for vert in verts:
            vert.co.x *= radius
            vert.co.y *= radius
            vert.co.z *= radius_z
        bmesh.ops.transform(
            bm, verts=verts, matrix=Matrix.Translation((jitter_x, jitter_y, lobe_z))
        )

    obj = _new_object("birch", collection, bm)
    obj.data.materials.append(materials["birch_bark"])
    obj.data.materials.append(materials["birch_leaf"])
    for i, polygon in enumerate(obj.data.polygons):
        polygon.material_index = 0 if i < trunk_faces else 1
    shade_smooth(obj, sharp_above_degrees=35.0)

    _add_birch_flecks(
        collection, obj, materials, trunk_height=trunk_height, base_radius=base_radius
    )
    return obj


# --- Houses ---------------------------------------------------------------


def _gable_house(
    collection,
    name,
    material_wall,
    material_roof,
    material_trim,
    material_window,
    *,
    width,
    depth,
    ridge_height,
    ridge_axis,
    open_front=False,
    windows=False,
):
    """A single-storey gable house: red walls, a grey roof, white corner
    boards -- and, on the front eave wall only, white-trimmed windows.

    `ridge_axis` is which horizontal axis the ridge line runs along; the
    kit's shared front (+Y) is a long eave wall when the ridge runs along X
    (`house_red`) and an open gable end when it runs along Y
    (`boathouse_red`) -- both conventions the plan calls for on the two
    houses in this kit.
    """
    eave_height = ridge_height * params.KIT_HOUSE_EAVE_FRACTION
    hw, hd = width / 2, depth / 2

    bm = bmesh.new()

    def v(x, y, z):
        return bm.verts.new((x, y, z))

    a0 = v(-hw, -hd, 0.0)
    b0 = v(hw, -hd, 0.0)
    c0 = v(hw, hd, 0.0)
    d0 = v(-hw, hd, 0.0)
    a1 = v(-hw, -hd, eave_height)
    b1 = v(hw, -hd, eave_height)
    c1 = v(hw, hd, eave_height)
    d1 = v(-hw, hd, eave_height)

    if ridge_axis == "x":
        r0 = v(-hw, 0.0, ridge_height)
        r1 = v(hw, 0.0, ridge_height)
        front_is_gable = False
    else:
        r0 = v(0.0, -hd, ridge_height)
        r1 = v(0.0, hd, ridge_height)
        front_is_gable = True

    def quad(p0, p1, p2, p3):
        try:
            bm.faces.new((p0, p1, p2, p3))
        except ValueError:
            pass

    def tri(p0, p1, p2):
        try:
            bm.faces.new((p0, p1, p2))
        except ValueError:
            pass

    front_open = open_front and front_is_gable

    # Every wall is one of two shapes: a plain rectangle (an eave wall,
    # running under a roof slope) or a rectangle with a triangle above it
    # closing to the ridge (a gable). Which pair of opposite walls is which
    # -- and where the ridge points sit -- is all that changes with
    # `ridge_axis`; the vertex winding that faces each wall outward is fixed
    # by which side of the box it is on.
    if ridge_axis == "x":
        # Eave walls, y = -hd and y = +hd.
        quad(a0, b0, b1, a1)
        quad(d0, d1, c1, c0)
        # Gable walls, x = -hw and x = +hw -- neither is ever the open one;
        # `open_front` only applies when the front (+Y) wall is a gable.
        quad(a0, a1, d1, d0)
        tri(a1, r0, d1)
        quad(b0, c0, c1, b1)
        tri(b1, c1, r1)
        # Roof: two slopes either side of the ridge, each running its length
        # and down to one eave wall.
        quad(d1, r0, r1, c1)
        quad(r0, a1, b1, r1)
    else:
        # Eave walls, x = -hw and x = +hw.
        quad(a0, a1, d1, d0)
        quad(b0, c0, c1, b1)
        # Gable walls, y = -hd (back, always closed) and y = +hd (front --
        # the one `boathouse_red` leaves open toward the water).
        quad(a0, b0, b1, a1)
        tri(a1, b1, r0)
        if not front_open:
            quad(d0, d1, c1, c0)
            tri(c1, d1, r1)
        # Roof.
        quad(a1, r0, r1, d1)
        quad(b1, c1, r1, r0)

    obj = _new_object(name, collection, bm)
    obj.data.materials.append(material_wall)
    obj.data.materials.append(material_roof)
    for polygon in obj.data.polygons:
        polygon.material_index = 1 if abs(polygon.normal.z) > 0.35 else 0
    shade_smooth(obj, sharp_above_degrees=20.0)

    trim = _build_house_trim(
        collection,
        f"{name}_trim",
        width=width,
        depth=depth,
        eave_height=eave_height,
        ridge_axis=ridge_axis,
        windows=windows,
    )
    _join_part(obj, trim, material_trim)

    panes = _build_window_panes(
        collection,
        f"{name}_panes",
        width=width,
        depth=depth,
        eave_height=eave_height,
        ridge_axis=ridge_axis,
        windows=windows,
    )
    _join_part(obj, panes, material_window)

    return obj


def _join_part(obj, part, material):
    """Merge a small extra mesh into `obj`'s data as one more material slot.

    `part` may be `None` -- the no-op case, when a house is built with
    `windows=False` and there is nothing to add.
    """
    if part is None:
        return
    n_part_faces = len(part.data.polygons)
    joined = bmesh.new()
    joined.from_mesh(obj.data)
    joined.from_mesh(part.data)
    joined.to_mesh(obj.data)
    joined.free()
    material_index = len(obj.data.materials)
    obj.data.materials.append(material)
    n_total = len(obj.data.polygons)
    for i, polygon in enumerate(obj.data.polygons):
        if i >= n_total - n_part_faces:
            polygon.material_index = material_index
    bpy.data.objects.remove(part, do_unlink=True)


def _window_positions(width, ridge_axis):
    """The two front-wall window centres, as a fraction of the wall width."""
    return (-width * 0.22, width * 0.22)


def _build_house_trim(collection, name, *, width, depth, eave_height, ridge_axis, windows):
    """White corner boards, and window-frame trim on the front eave wall.

    A separate small mesh, joined into the house afterwards -- easier to
    reason about as its own set of boxes than interleaved with the gable
    faces above.
    """
    proud = params.KIT_HOUSE_TRIM_PROUD
    board_w = 0.22
    hw, hd = width / 2, depth / 2

    bm = bmesh.new()

    corners = [(-hw, -hd), (hw, -hd), (hw, hd), (-hw, hd)]
    for cx, cy in corners:
        nx = 1.0 if cx > 0 else -1.0
        ny = 1.0 if cy > 0 else -1.0
        matrix = Matrix.Translation(
            (cx + nx * proud * 0.3, cy + ny * proud * 0.3, eave_height / 2)
        )
        _add_box(bm, board_w, board_w, eave_height, matrix)

    if windows:
        # Two windows on the front (+Y) eave wall, whichever axis it is on.
        window_w, window_h = 0.9, 1.1
        sill = eave_height * 0.30
        frame_extra = 0.10
        for ox in _window_positions(width, ridge_axis):
            if ridge_axis == "x":
                cx, cy = ox, hd + proud * 0.5
                _add_box(
                    bm,
                    window_w + frame_extra,
                    0.05,
                    window_h + frame_extra,
                    Matrix.Translation((cx, cy, sill + window_h / 2)),
                )
            else:
                cx, cy = hw + proud * 0.5, ox
                _add_box(
                    bm,
                    0.05,
                    window_w + frame_extra,
                    window_h + frame_extra,
                    Matrix.Translation((cx, cy, sill + window_h / 2)),
                )

    if len(bm.verts) == 0:
        bm.free()
        return None
    return _new_object(name, collection, bm)


def _build_window_panes(collection, name, *, width, depth, eave_height, ridge_axis, windows):
    """The dark glass behind the window trim -- what tells a viewer the white
    frame is a window and not just a painted cross on the wall."""
    if not windows:
        return None

    proud = params.KIT_HOUSE_TRIM_PROUD
    hw, hd = width / 2, depth / 2
    window_w, window_h = 0.9, 1.1
    sill = eave_height * 0.30

    bm = bmesh.new()
    for ox in _window_positions(width, ridge_axis):
        if ridge_axis == "x":
            cx, cy = ox, hd + proud * 0.25
            _add_box(
                bm, window_w, 0.02, window_h, Matrix.Translation((cx, cy, sill + window_h / 2))
            )
        else:
            cx, cy = hw + proud * 0.25, ox
            _add_box(
                bm, 0.02, window_w, window_h, Matrix.Translation((cx, cy, sill + window_h / 2))
            )

    return _new_object(name, collection, bm)


def _build_houses(collection, materials):
    house_red = _gable_house(
        collection,
        "house_red",
        materials["falu_red"],
        materials["roof_grey"],
        materials["trim_white"],
        materials["window_dark"],
        width=params.KIT_HOUSE_WIDTH,
        depth=params.KIT_HOUSE_DEPTH,
        ridge_height=params.KIT_HOUSE_RIDGE,
        ridge_axis="x",
        windows=True,
    )
    boathouse_red = _gable_house(
        collection,
        "boathouse_red",
        materials["falu_red"],
        materials["roof_grey"],
        materials["trim_white"],
        materials["window_dark"],
        width=params.KIT_BOATHOUSE_WIDTH,
        depth=params.KIT_BOATHOUSE_DEPTH,
        ridge_height=params.KIT_BOATHOUSE_RIDGE,
        ridge_axis="y",
        open_front=True,
        windows=False,
    )
    house_red_b = _build_house_red_b(collection, materials)
    sauna_red = _build_sauna(collection, materials)
    return house_red, boathouse_red, house_red_b, sauna_red


def _build_porch(collection, *, width, depth, house_hd, roof_height, post_size=0.14):
    """Two white posts and a flat canopy roof, standing proud of a gable
    front -- the veranda that keeps `house_red_b`'s silhouette from being
    `house_red` at a different scale."""
    bm = bmesh.new()
    hw = width / 2
    for px in (-hw + post_size, hw - post_size):
        matrix = Matrix.Translation((px, house_hd + depth - post_size, roof_height / 2))
        _add_box(bm, post_size, post_size, roof_height, matrix)
    roof_thickness = 0.08
    roof_matrix = Matrix.Translation(
        (0.0, house_hd + depth / 2, roof_height + roof_thickness / 2)
    )
    _add_box(bm, width, depth, roof_thickness, roof_matrix)
    return _new_object("house_red_b_porch", collection, bm)


def _build_house_red_b(collection, materials):
    """A second falu-red cottage, deliberately a different shape from
    `house_red`: smaller, gable end to the front rather than a long eave
    wall, with a white-trimmed porch standing off that gable."""
    house = _gable_house(
        collection,
        "house_red_b",
        materials["falu_red"],
        materials["roof_grey"],
        materials["trim_white"],
        materials["window_dark"],
        width=params.KIT_HOUSE_B_WIDTH,
        depth=params.KIT_HOUSE_B_DEPTH,
        ridge_height=params.KIT_HOUSE_B_RIDGE,
        ridge_axis="y",
        open_front=False,
        windows=False,
    )
    eave_height = params.KIT_HOUSE_B_RIDGE * params.KIT_HOUSE_EAVE_FRACTION
    porch = _build_porch(
        collection,
        width=params.KIT_HOUSE_B_PORCH_WIDTH,
        depth=params.KIT_HOUSE_B_PORCH_DEPTH,
        house_hd=params.KIT_HOUSE_B_DEPTH / 2,
        roof_height=eave_height * params.KIT_HOUSE_B_PORCH_HEIGHT_FRACTION,
    )
    _join_part(house, porch, materials["trim_white"])
    return house


def _build_sauna(collection, materials):
    """A small shoreline sauna: a low gable box with a short stove flue
    poking through the roof, set back from the ridge centre so it reads as
    a chimney rather than a decoration."""
    sauna = _gable_house(
        collection,
        "sauna_red",
        materials["falu_red"],
        materials["roof_grey"],
        materials["trim_white"],
        materials["window_dark"],
        width=params.KIT_SAUNA_WIDTH,
        depth=params.KIT_SAUNA_DEPTH,
        ridge_height=params.KIT_SAUNA_RIDGE,
        ridge_axis="x",
        windows=False,
    )
    bm = bmesh.new()
    chimney_h = params.KIT_SAUNA_CHIMNEY_HEIGHT
    chimney_r = params.KIT_SAUNA_CHIMNEY_RADIUS
    cx = params.KIT_SAUNA_WIDTH * 0.22
    matrix = Matrix.Translation((cx, 0.0, params.KIT_SAUNA_RIDGE + chimney_h / 2))
    _add_cone(bm, chimney_r, chimney_r * 0.85, chimney_h, 8, matrix)
    chimney = _new_object("sauna_red_chimney", collection, bm)
    _join_part(sauna, chimney, materials["roof_grey"])
    return sauna


# --- Jetty, sea mark, flagpole ---------------------------------------------


def _build_jetty(collection, materials):
    bm = bmesh.new()
    length = params.KIT_JETTY_LENGTH
    width = params.KIT_JETTY_WIDTH
    deck_h = params.KIT_JETTY_DECK_HEIGHT
    thickness = params.KIT_JETTY_DECK_THICKNESS

    deck_matrix = Matrix.Translation((0.0, length / 2, deck_h - thickness / 2))
    _add_box(bm, width, length, thickness, deck_matrix)

    pile_radius = params.KIT_JETTY_PILE_RADIUS
    spacing = params.KIT_JETTY_PILE_SPACING
    drop = params.KIT_JETTY_PILE_DROP
    pile_height = deck_h - thickness + drop
    n_piles = max(2, int(length / spacing))
    for i in range(n_piles):
        py = spacing * 0.5 + i * spacing
        for px in (-width / 2 + pile_radius * 1.5, width / 2 - pile_radius * 1.5):
            matrix = Matrix.Translation((px, py, (deck_h - thickness) - pile_height / 2))
            _add_cone(bm, pile_radius, pile_radius, pile_height, 6, matrix)

    # One material for the whole thing -- deck and piles are the same
    # weathered timber, not two different substances.
    obj = _new_object("jetty", collection, bm)
    obj.data.materials.append(materials["timber"])
    shade_smooth(obj, sharp_above_degrees=20.0)
    return obj


def _build_sea_mark(collection, materials):
    """A stone cairn: a handful of irregular, tapering courses of rock."""
    rng = random.Random(7)
    bm = bmesh.new()
    height = params.KIT_SEA_MARK_HEIGHT
    courses = 5
    z = 0.0
    for i in range(courses):
        frac = i / (courses - 1)
        course_h = height / courses * 1.3
        radius = (0.55 - 0.42 * frac) * height / 3.0
        cx = rng.uniform(-0.06, 0.06) * height
        cy = rng.uniform(-0.06, 0.06) * height
        rot = rng.uniform(0, 360)
        squash = rng.uniform(0.8, 1.15)
        matrix = (
            Matrix.Translation((cx, cy, z + course_h / 2))
            @ Matrix.Rotation(math.radians(rot), 4, "Z")
            @ Matrix.Diagonal((1.0, squash, 1.0, 1.0))
        )
        _add_box(bm, radius * 1.8, radius * 1.8, course_h, matrix)
        z += course_h * 0.75

    obj = _new_object("sea_mark", collection, bm)
    obj.data.materials.append(materials["granite"])
    shade_smooth(obj, sharp_above_degrees=25.0)
    return obj


def _build_flagpole(collection, materials):
    bm = bmesh.new()
    height = params.KIT_FLAGPOLE_HEIGHT
    radius = params.KIT_FLAGPOLE_RADIUS
    matrix = Matrix.Translation((0.0, 0.0, height / 2))
    _add_cone(bm, radius, radius * 0.6, height, 8, matrix)
    pole_obj = _new_object("flagpole", collection, bm)
    pole_obj.data.materials.append(materials["pole_white"])
    shade_smooth(pole_obj, sharp_above_degrees=30.0)

    # The flag: a small blue field with a yellow Nordic cross, built as a
    # blue base plane plus two crossing raised bars rather than a texture --
    # nothing in this kit is textured (`params.py`, "Archipelago prop kit").
    flag_w = params.KIT_FLAG_WIDTH
    flag_h = params.KIT_FLAG_HEIGHT
    fly_z = height * 0.92
    base_y = radius * 0.6

    # A thin box rather than a single no-thickness plane: bmesh will not
    # accept two coincident faces of opposite winding as the cheap way to
    # make a plane double-sided, and a flag this close to the camera path's
    # ocean stop is worth the handful of extra triangles real thickness costs.
    flag_bm = bmesh.new()
    _add_box(
        flag_bm, flag_w, 0.015, flag_h, Matrix.Translation((flag_w / 2, base_y, fly_z))
    )
    blue_face_count = len(flag_bm.faces)

    cross_x = flag_w * 0.32
    cross_y_thickness = flag_h * 0.22
    vertical_matrix = Matrix.Translation((cross_x, base_y - 0.01, fly_z))
    _add_box(flag_bm, cross_y_thickness, 0.02, flag_h, vertical_matrix)
    horizontal_matrix = Matrix.Translation((flag_w / 2 + cross_x * 0.2, base_y - 0.01, fly_z))
    _add_box(flag_bm, flag_w, 0.02, cross_y_thickness, horizontal_matrix)

    flag_obj = _new_object("flagpole_flag", collection, flag_bm)
    flag_obj.data.materials.append(materials["flag_blue"])
    flag_obj.data.materials.append(materials["flag_yellow"])
    for i, polygon in enumerate(flag_obj.data.polygons):
        polygon.material_index = 0 if i < blue_face_count else 1

    # Joined into the pole so `flagpole` stays a single root object, per the
    # kit's eight-named-roots contract.
    joined = bmesh.new()
    joined.from_mesh(pole_obj.data)
    joined.from_mesh(flag_obj.data)
    joined.to_mesh(pole_obj.data)
    joined.free()
    # `pole_obj` carries one material already (`pole_white`, index 0), so the
    # flag's two land at 1 and 2 -- not 2 and 3, which is what a join onto an
    # already-textured object always has to account for.
    blue_index = len(pole_obj.data.materials)
    pole_obj.data.materials.append(materials["flag_blue"])
    yellow_index = len(pole_obj.data.materials)
    pole_obj.data.materials.append(materials["flag_yellow"])
    n_pole_faces = len(pole_obj.data.polygons) - len(flag_obj.data.polygons)
    for i, polygon in enumerate(pole_obj.data.polygons):
        if i >= n_pole_faces:
            local = i - n_pole_faces
            polygon.material_index = blue_index if local < blue_face_count else yellow_index
    bpy.data.objects.remove(flag_obj, do_unlink=True)

    return pole_obj


# --- Dinghy -------------------------------------------------------------


def _build_dinghy(collection, materials):
    """A clinker-built eka -- the double-ended rowing skiff of the Stockholm
    archipelago, rather than a transom dory -- pulled up bow-first onto the
    rock.

    Built directly from five cross-section stations (bow and stern pinch to
    a single point each) as one starboard half, then closed with
    `lib.mesh.mirror_x` the same way the boat hull itself is -- reusing the
    shared lofting idiom rather than hand-picking winding for a mirrored
    quad strip. The top strake is a second material, the one detail that
    tells a viewer this is a painted boat and not a raw hull.
    """
    length = params.KIT_DINGHY_LENGTH
    beam = params.KIT_DINGHY_BEAM
    depth = params.KIT_DINGHY_DEPTH
    strake_frac = params.KIT_DINGHY_STRAKE_FRACTION

    half_len = length / 2
    stations_y = [-half_len, -half_len * 0.45, 0.0, half_len * 0.45, half_len]
    half_beams = [0.0, beam * 0.42, beam * 0.5, beam * 0.42, 0.0]
    tops = [depth * 0.85, depth, depth * 1.02, depth, depth * 0.85]
    bottoms = [depth * 0.55, depth * 0.12, 0.0, depth * 0.12, depth * 0.55]

    bm = bmesh.new()
    keel, strake, top = [], [], []
    for y, hb, top_z, bottom_z in zip(stations_y, half_beams, tops, bottoms):
        strake_z = bottom_z + (top_z - bottom_z) * strake_frac
        keel.append(bm.verts.new((0.0, y, bottom_z)))
        strake.append(bm.verts.new((hb, y, strake_z)))
        top.append(bm.verts.new((hb, y, top_z)))

    def quad(p0, p1, p2, p3):
        try:
            bm.faces.new((p0, p1, p2, p3))
        except ValueError:
            pass

    n = len(stations_y)
    for i in range(n - 1):
        quad(keel[i], keel[i + 1], strake[i + 1], strake[i])
        quad(strake[i], strake[i + 1], top[i + 1], top[i])

    n_lower = n - 1

    obj = _new_object("dinghy", collection, bm)
    obj.data.materials.append(materials["timber"])
    obj.data.materials.append(materials["boat_paint"])
    for i, polygon in enumerate(obj.data.polygons):
        polygon.material_index = 0 if i < n_lower else 1
    mirror_x(obj)
    shade_smooth(obj, sharp_above_degrees=30.0)

    thwart_bm = bmesh.new()
    thwart_z = depth * 0.75
    _add_box(
        thwart_bm, beam * 0.8, 0.05, 0.04, Matrix.Translation((0.0, 0.0, thwart_z))
    )
    thwart = _new_object("dinghy_thwart", collection, thwart_bm)
    _join_part(obj, thwart, materials["timber"])

    return obj


def build(collection):
    """Build all sixteen kit parts. Returns a dict of named objects."""
    materials = _materials()

    pine_a, pine_b, pine_stunted = _build_pines(collection, materials)
    house_red, boathouse_red, house_red_b, sauna_red = _build_houses(
        collection, materials
    )
    jetty = _build_jetty(collection, materials)
    sea_mark = _build_sea_mark(collection, materials)
    flagpole = _build_flagpole(collection, materials)

    boulder_a = _build_boulder(
        collection,
        "boulder_a",
        materials,
        diameter=params.KIT_BOULDER_A_DIAMETER,
        height_fraction=params.KIT_BOULDER_A_HEIGHT_FRACTION,
        seed=11,
    )
    boulder_b = _build_boulder(
        collection,
        "boulder_b",
        materials,
        diameter=params.KIT_BOULDER_B_DIAMETER,
        height_fraction=params.KIT_BOULDER_B_HEIGHT_FRACTION,
        seed=12,
    )
    rock_stack = _build_rock_stack(collection, materials)
    juniper = _build_juniper(collection, materials)
    birch = _build_birch(collection, materials)
    dinghy = _build_dinghy(collection, materials)

    return {
        "pine_a": pine_a,
        "pine_b": pine_b,
        "pine_stunted": pine_stunted,
        "house_red": house_red,
        "boathouse_red": boathouse_red,
        "jetty": jetty,
        "sea_mark": sea_mark,
        "flagpole": flagpole,
        "boulder_a": boulder_a,
        "boulder_b": boulder_b,
        "juniper": juniper,
        "birch": birch,
        "house_red_b": house_red_b,
        "sauna_red": sauna_red,
        "dinghy": dinghy,
        "rock_stack": rock_stack,
    }

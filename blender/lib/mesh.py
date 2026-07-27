"""
Mesh construction helpers.

Everything here builds plain quad grids and hands them to Blender. Nothing uses
`bpy.ops` where a direct API call will do -- operators depend on context and
selection state, which is exactly the sort of thing that behaves differently in
`--background` than it does in the GUI.
"""

import bmesh
import bpy


GENERATED_COLLECTION = "maxi77_generated"
"""Everything the build produces lands in this collection, under a stable name.

Stable because it is the one thing a linked-file workflow would need later: a
manual .blend can link this collection and add to it, and rebuilds then flow
through underneath the hand work. Nothing else about that workflow is built
until it is actually wanted.
"""


def reset_scene() -> bpy.types.Collection:
    """Empty the file and return a fresh generated collection.

    The .blend is a build artifact -- every run starts from nothing so that the
    output depends only on the scripts, never on what happened to be left over.
    """
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)

    for datablock in (
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.materials,
        bpy.data.collections,
        bpy.data.images,
    ):
        for item in list(datablock):
            datablock.remove(item, do_unlink=True)

    collection = bpy.data.collections.new(GENERATED_COLLECTION)
    bpy.context.scene.collection.children.link(collection)
    return collection


def grid_to_mesh(
    name: str,
    rings: list[list[tuple[float, float, float]]],
    collection: bpy.types.Collection,
    *,
    close_rings: bool = False,
    weld_distance: float = 1e-4,
    skip=None,
) -> bpy.types.Object:
    """Skin a sequence of equal-length rings into a quad mesh.

    `rings` is a list of cross-sections, each the same number of points, ordered
    consistently. Adjacent rings are joined into quads. `close_rings` joins the
    last point of each ring back to the first, for closed sections.

    Degenerate rings are allowed and expected -- the bow station collapses to a
    single point. The weld pass at the end weeds out the zero-area faces that
    creates, turning the collapsed ring into a proper pole.

    `skip(i, j)` leaves out the quad between rings `i` and `i + 1` spanning
    points `j` and `j + 1`, which is how a lofted skin gets a hole in it. The
    cabin windows are the case it exists for: an opening in a surface that is
    otherwise generated, where the alternative is a boolean against a mesh with
    no volume to subtract from. It works because a loft's parameterisation is
    free -- put a row of points on each edge of the opening (see
    `deck.band_ladder`) and a station on each end of it, and the hole is a row
    of faces not written. Nothing is left loose: every vertex on the rim still
    belongs to the faces on the other side of it.
    """
    if len(rings) < 2:
        raise ValueError(f"{name}: need at least two rings")

    width = len(rings[0])
    if any(len(r) != width for r in rings):
        raise ValueError(f"{name}: all rings must have the same point count")

    verts = [p for ring in rings for p in ring]

    faces = []
    span = width if close_rings else width - 1
    for i in range(len(rings) - 1):
        base = i * width
        nxt = base + width
        for j in range(span):
            if skip is not None and skip(i, j):
                continue
            k = (j + 1) % width
            faces.append((base + j, base + k, nxt + k, nxt + j))

    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.validate(verbose=False)

    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)

    if weld_distance > 0:
        weld(obj, weld_distance)

    return obj


def weld(obj: bpy.types.Object, distance: float = 1e-4) -> None:
    """Merge coincident vertices and drop the degenerate faces that leaves."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=distance)
    bmesh.ops.dissolve_degenerate(bm, dist=distance, edges=bm.edges)
    bm.to_mesh(obj.data)
    bm.free()


def mirror_x(obj: bpy.types.Object, merge_distance: float = 1e-4) -> None:
    """Mirror across the centreline plane and merge the seam.

    Applied immediately rather than left as a modifier: the export has to apply
    it anyway, and `verify.py` measures real vertex positions.
    """
    bm = bmesh.new()
    bm.from_mesh(obj.data)

    geom = list(bm.verts) + list(bm.edges) + list(bm.faces)
    result = bmesh.ops.duplicate(bm, geom=geom)
    duplicated = [g for g in result["geom"] if isinstance(g, bmesh.types.BMVert)]
    bmesh.ops.scale(bm, vec=(-1.0, 1.0, 1.0), verts=duplicated)
    bmesh.ops.reverse_faces(
        bm, faces=[g for g in result["geom"] if isinstance(g, bmesh.types.BMFace)]
    )
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=merge_distance)

    bm.to_mesh(obj.data)
    bm.free()


def join(objs: list[bpy.types.Object], name: str) -> bpy.types.Object | None:
    """Merge objects into one, under a given name.

    Almost everything here that is built piece by piece -- a pair of windows, a
    dozen stanchions, six wires -- ships as one mesh, because the export carries
    an object's worth of overhead per object and these are a handful of faces
    each. The first object is kept and renamed so that whatever the caller does
    with the return value keeps working.
    """
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


def face_towards(obj: bpy.types.Object, direction: tuple) -> None:
    """Make every face of an open sheet agree, and face the given way.

    `recalc_normals` is for solids. It works out which side of a closed surface
    is the outside, and a flat panel does not have one -- asked about a
    single-sided sheet it makes the faces *consistent* with each other and then
    picks a direction, and which direction it picks is not something to rely on.
    That matters in the app rather than in Blender: three.js draws front faces
    only, so a panel that comes out facing the wrong way is a hole.

    Faces that still disagree after that are dropped. `recalc_face_normals` can
    only make a surface consistent where the surface is one: given a sheet that
    laps over itself it orients each lap on its own terms, and the pair then
    cannot both be right. A lap is not a thing a flat panel does -- it is the
    fan in `deck._doorway_fan` folding back on itself where the coachroof's aft
    face runs out of width along the side decks -- so what is dropped is a fold,
    not a piece of panel. Left in, the folded faces are lit from behind and read
    as dark wedges in the corners of the one panel the cabin camera looks at.
    """
    from mathutils import Vector

    aim = Vector(direction)

    bm = bmesh.new()
    bm.from_mesh(obj.data)

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()

    # Area-weighted, so a handful of slivers cannot outvote the panel.
    total = sum((f.normal * f.calc_area() for f in bm.faces), Vector())
    if total.dot(aim) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
        bm.normal_update()

    folded = [f for f in bm.faces if f.normal.dot(aim) < 0.0]
    if folded:
        bmesh.ops.delete(bm, geom=folded, context="FACES")

    bm.to_mesh(obj.data)
    bm.free()


def bisect(obj: bpy.types.Object, plane_co: tuple, plane_no: tuple) -> None:
    """Cut the mesh along a plane, leaving both halves joined.

    Two jobs, and they are the same job: putting a boundary where one is wanted.
    `materials.assign_split` uses it to stop a face having to belong wholly to
    one side of the waterline, and `deck._build_companionway` to put an edge
    along a crease rather than let quads straddle it -- a flat-shaded quad with
    a bend through the middle of it has no correct normal, and shows as a streak.
    """
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.bisect_plane(
        bm,
        geom=list(bm.verts) + list(bm.edges) + list(bm.faces),
        plane_co=plane_co,
        plane_no=plane_no,
    )
    bm.to_mesh(obj.data)
    bm.free()


def cap_loop(obj: bpy.types.Object, points: list[tuple[float, float, float]]) -> bool:
    """Close a boundary with a single face through `points`, in order.

    `points` must walk the boundary, because the face is built from them
    directly -- an unordered set produces a self-intersecting mess. Vertices are
    matched by position, since the weld pass has already renumbered everything.

    Ordering matters more than it sounds. The transom's boundary is not a closed
    ring in the mesh: the hull is an open shell with no deck, so the loop runs up
    one side, across the keel, and down the other, with the top left open. There
    is nothing for a fill operator to find, which is why the transom came out as
    an open wedge until this was done explicitly.

    Returns whether a face was created.
    """
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()

    ordered = []
    for target in points:
        best = min(
            bm.verts,
            key=lambda v: (v.co.x - target[0]) ** 2
            + (v.co.y - target[1]) ** 2
            + (v.co.z - target[2]) ** 2,
        )
        if best not in ordered:
            ordered.append(best)

    created = False
    if len(ordered) >= 3:
        try:
            bm.faces.new(ordered)
            created = True
        except ValueError:
            pass  # already faced, or degenerate -- leave it alone

    bm.to_mesh(obj.data)
    bm.free()
    return created


def transom_loop(
    ring: list[tuple[float, float, float]],
) -> list[tuple[float, float, float]]:
    """Walk a mirrored half-section around its boundary, once.

    Takes the half-section as generated (centreline first, sheer last) and
    returns the full loop: down the starboard side from the sheer to the keel,
    then up the port side. The centreline point is shared, so it appears once.
    """
    starboard = list(reversed(ring))
    port = [(-x, y, z) for (x, y, z) in ring[1:]]
    return starboard + port


def shade_smooth(obj: bpy.types.Object, sharp_above_degrees: float = 40.0) -> None:
    """Smooth shading, keeping edges sharper than the given angle crisp.

    Blender dropped the `use_auto_smooth` mesh flag in 4.1, so the split is done
    explicitly here: every face smooth, then edges past the threshold flagged
    sharp. That keeps the sheer line and the transom corner from smearing while
    the hull surface itself stays fair.
    """
    from math import degrees

    bm = bmesh.new()
    bm.from_mesh(obj.data)

    for face in bm.faces:
        face.smooth = True

    for edge in bm.edges:
        if len(edge.link_faces) == 2:
            edge.smooth = degrees(edge.calc_face_angle(0.0)) < sharp_above_degrees

    bm.to_mesh(obj.data)
    bm.free()


def bevel(
    obj: bpy.types.Object,
    width: float = 0.003,
    segments: int = 2,
    sharper_than_degrees: float = 25.0,
    smooth_above_degrees: float = 40.0,
) -> None:
    """Take the arris off every hard edge, then shade the result smooth.

    Nothing on a boat has a mathematically sharp edge. Joinery is radiused
    because a square corner splinters and hurts to fall against; mouldings are
    radiused because a female mould cannot be pulled off a knife edge; and metal
    is radiused because it is drawn or cast. A model without that reads as
    computer geometry no matter how correct its dimensions are, and it reads that
    way for a specific reason: a real edge catches a highlight along its length,
    and a zero-width edge has no length to catch one with.

    So this is a lighting device before it is a shape one. `width` is deliberately
    small -- a 3 mm radius is invisible as a shape at any distance and is the
    difference between an edge that glints and an edge that does not.

    Only edges between two faces are touched, and only those already sharper than
    `sharper_than_degrees`. Boundary edges are left alone: an open sheet -- a
    sail, the deckhead -- has nothing on the other side to bevel into, and
    rounding its border would pull the border off the shape it was cut to.

    `clamp_overlap` is on because the alternative is silent self-intersection
    wherever a panel is thinner than twice the width, and thin panels are most of
    the fit-out.
    """
    from math import degrees

    bm = bmesh.new()
    bm.from_mesh(obj.data)

    edges = [
        edge
        for edge in bm.edges
        if len(edge.link_faces) == 2
        and degrees(edge.calc_face_angle(0.0)) > sharper_than_degrees
    ]

    if edges:
        bmesh.ops.bevel(
            bm,
            geom=edges,
            offset=width,
            offset_type="OFFSET",
            segments=max(1, segments),
            profile=0.5,
            affect="EDGES",
            clamp_overlap=True,
            miter_outer="ARC" if segments > 1 else "SHARP",
        )

    for face in bm.faces:
        face.smooth = True
    for edge in bm.edges:
        if len(edge.link_faces) == 2:
            edge.smooth = degrees(edge.calc_face_angle(0.0)) < smooth_above_degrees

    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()


def recalc_normals(obj: bpy.types.Object, inward: bool = False) -> None:
    """Make normals point consistently outwards, or inwards.

    Outwards is right for anything you look *at*. Inwards is right for anything
    you look *into* -- a hatch well, the companionway -- because the faces that
    show are the inside ones. It matters more in the app than in Blender:
    Blender renders backfaces by default and three.js does not, so a well built
    outwards is a well you can see straight through once it is exported.
    """
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if inward:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()

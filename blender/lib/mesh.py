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
) -> bpy.types.Object:
    """Skin a sequence of equal-length rings into a quad mesh.

    `rings` is a list of cross-sections, each the same number of points, ordered
    consistently. Adjacent rings are joined into quads. `close_rings` joins the
    last point of each ring back to the first, for closed sections.

    Degenerate rings are allowed and expected -- the bow station collapses to a
    single point. The weld pass at the end weeds out the zero-area faces that
    creates, turning the collapsed ring into a proper pole.
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


def recalc_normals(obj: bpy.types.Object) -> None:
    """Make normals point outwards consistently."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()

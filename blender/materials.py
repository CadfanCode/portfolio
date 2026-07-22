"""
Materials.

Deliberately few and deliberately cheap, per CLAUDE.md: fake effects over real
simulation, bake where possible. Six materials cover the whole boat, and they
are assigned by geometry rather than by hand -- the antifouling is "every face
below the waterline", the topside band is "every face below the deck edge" --
so they survive the shapes being re-authored.

The band's colour is not decoration. The brochure describes the blue gelcoat as
what "naturligt delar av skrov och dack", and in white-on-white renders the
band and its windows are invisible, which is how they went missing from this
model in the first place.
"""

import bpy

import params


def _pbr(name, colour, roughness=0.4, metallic=0.0):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = material.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*colour, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    return material


def create():
    """The whole palette."""
    return {
        "gelcoat": _pbr("gelcoat", (0.82, 0.82, 0.80), roughness=0.18),
        "band": _pbr("band", (0.045, 0.105, 0.215), roughness=0.22),
        "glass": _pbr("glass", (0.020, 0.026, 0.032), roughness=0.06),
        "antifoul": _pbr("antifoul", (0.055, 0.048, 0.052), roughness=0.62),
        "spar": _pbr("spar", (0.055, 0.058, 0.062), roughness=0.34, metallic=0.65),
        "wire": _pbr("wire", (0.52, 0.54, 0.56), roughness=0.26, metallic=1.0),
        "canvas": _pbr("canvas", (0.30, 0.33, 0.38), roughness=0.78),
    }


def assign(obj, material):
    """Give an object a single material."""
    if obj is None:
        return
    obj.data.materials.clear()
    obj.data.materials.append(material)


def assign_split(obj, below, above, plane_z=0.0, axis="z"):
    """Two materials, split by a plane.

    Used for the boot top -- everything under the waterline is antifouled -- and
    nothing else needs to know where the waterline is.

    The mesh is cut along the plane first. Without that, faces can only belong
    wholly to one side, and the boot top comes out as a visible staircase
    wherever a face straddles the waterline.
    """
    if obj is None:
        return

    _bisect(obj, plane_z, axis)
    obj.data.materials.clear()
    obj.data.materials.append(above)
    obj.data.materials.append(below)

    mesh = obj.data
    for polygon in mesh.polygons:
        centre = polygon.center
        value = getattr(centre, axis)
        polygon.material_index = 1 if value < plane_z else 0


def _bisect(obj, plane_z, axis):
    """Cut the mesh along a plane, leaving both halves joined."""
    import bmesh

    normal = {"x": (1.0, 0.0, 0.0), "y": (0.0, 1.0, 0.0), "z": (0.0, 0.0, 1.0)}[axis]
    origin = tuple(plane_z * n for n in normal)

    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.bisect_plane(
        bm,
        geom=list(bm.verts) + list(bm.edges) + list(bm.faces),
        plane_co=origin,
        plane_no=normal,
    )
    bm.to_mesh(obj.data)
    bm.free()


def assign_deck(obj, band_surface, material_deck, material_band, tolerance=0.020):
    """Split the deck moulding into its flat top and its topside band.

    The band is found geometrically rather than by picking faces, so the split
    survives the sheer, the band height or the cockpit moving. A face is band if
    it actually sits on the band's surface -- its centre within `tolerance` of
    where that surface is at its own station and height.

    Looser rules do not work here, and both failures were visible. Testing only
    "below the deck edge" painted the whole cockpit as topsides, since its sole
    is far below. Adding "faces sideways and is well outboard" fixed that but
    still caught the cockpit's outer edge near the transom, where the side deck
    narrows to a centimetre and that edge is as far outboard as the band is.
    """
    if obj is None:
        return

    obj.data.materials.clear()
    obj.data.materials.append(material_deck)
    obj.data.materials.append(material_band)

    for polygon in obj.data.polygons:
        centre = polygon.center
        expected = band_surface(params.y_to_station(centre.y), centre.z)

        on_band = expected is not None and abs(abs(centre.x) - expected) < tolerance
        polygon.material_index = 1 if on_band else 0


def apply(built, band_surface):
    """Dress the whole boat."""
    palette = create()

    assign_split(built.get("hull"), palette["antifoul"], palette["gelcoat"])
    assign(built.get("rubrail"), palette["band"])

    for name in ("keel", "skeg", "rudder"):
        assign(built.get(name), palette["antifoul"])

    for name in ("deck_fwd", "deck_aft"):
        assign_deck(
            built.get(name), band_surface, palette["gelcoat"], palette["band"]
        )

    assign(built.get("windows"), palette["glass"])
    assign(built.get("companion"), palette["glass"])
    assign(built.get("sailbox"), palette["gelcoat"])

    for name in ("mast", "boom", "spreaders"):
        assign(built.get(name), palette["spar"])

    assign(built.get("rigging"), palette["wire"])
    assign(built.get("sailcover"), palette["canvas"])

    return palette

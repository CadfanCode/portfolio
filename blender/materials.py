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
        # Marine blue below the waterline, not black. Antifouling comes in
        # both and the blue is what the boat is painted; it also does something
        # black cannot, which is stay a colour in shadow -- a black bottom
        # against dark water reads as a hole where the hull ought to be.
        "antifoul": _pbr("antifoul", (0.028, 0.068, 0.145), roughness=0.60),
        "spar": _pbr("spar", (0.055, 0.058, 0.062), roughness=0.34, metallic=0.65),
        "wire": _pbr("wire", (0.52, 0.54, 0.56), roughness=0.26, metallic=1.0),
        "canvas": _pbr("canvas", (0.30, 0.33, 0.38), roughness=0.78),
        # Deck fittings. Chrome is a separate material from `wire` and not a
        # tidier version of it: a wire is 5 mm across and reads as a line, so
        # its colour is all it has, while a rail is 32 mm and reads as a
        # cylinder -- which only happens if it is polished enough to run a
        # highlight down. Anodised spar grey on a stanchion looks like plastic.
        #
        # Polished stainless rather than true chrome, which is also what the
        # fittings are. At metallic 1.0 and roughness 0.09 these came out as
        # black mirrors: a mirror shows what is around it, and what is around
        # this boat is a dark sky. Backing both off puts enough diffuse in to
        # read as bright metal without waiting for an environment to light it.
        "chrome": _pbr("chrome", (0.84, 0.86, 0.88), roughness=0.21, metallic=0.85),
        "engine": _pbr("engine", (0.10, 0.11, 0.12), roughness=0.38),
        # Bare drawn aluminium: brighter and less anodised than `spar`, which is
        # the black extrusion the mast is. The compression post is the one of
        # these anybody gets close to.
        "alloy": _pbr("alloy", (0.62, 0.64, 0.66), roughness=0.30, metallic=0.85),
        # Dacron. Not white: sailcloth is warm and it is translucent, and a pure
        # white sail against a pale sky is a hole in the picture.
        "sailcloth": _pbr("sailcloth", (0.855, 0.845, 0.815), roughness=0.72),
        # Cushion fabric, the warmest thing on the boat. The brochure's interior
        # photographs are teak, cream vinyl and brown cloth, and the cloth is
        # what stops the other two reading as a bathroom.
        "cushion": _pbr("cushion", (0.335, 0.245, 0.180), roughness=0.88),
        # Below deck. Three, and the same argument as above applies: in
        # white-on-white the cabin is a cave with no readable shape in it, and
        # the boat's interior is not white -- it is teak against a light vinyl
        # liner, which is most of why the brochure's photographs look warm.
        "teak": _pbr("teak", (0.235, 0.125, 0.058), roughness=0.42),
        "vinyl": _pbr("vinyl", (0.775, 0.755, 0.715), roughness=0.72),
        "sole": _pbr("sole", (0.235, 0.075, 0.062), roughness=0.68),
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
    assign(built.get("forehatch_pane"), palette["glass"])
    for name in ("anchorbox", "forehatch", "companionway", "cockpit_lids"):
        assign(built.get(name), palette["gelcoat"])

    for name in ("mast", "boom", "spreaders"):
        assign(built.get(name), palette["spar"])

    assign(built.get("rigging"), palette["wire"])
    assign(built.get("sailcover"), palette["canvas"])

    # --- Deck fittings.
    for name in ("pulpit", "stanchions", "stern_rail", "winches", "traveller"):
        assign(built.get(name), palette["chrome"])

    assign(built.get("lifelines"), palette["wire"])
    assign(built.get("outboard"), palette["engine"])

    # The tiller and the cockpit flooring are the only teak anybody sees from
    # outside the boat, and they are the two pieces the cockpit stop is closest
    # to. Same material as the companionway surround, which is the point -- the
    # three of them are the whole warm end of an otherwise white cockpit.
    for name in ("tiller", "cockpit_grating", "pulpit_block"):
        assign(built.get(name), palette["teak"])

    # --- Sails.
    for name in ("mainsail", "genoa"):
        assign(built.get(name), palette["sailcloth"])
    assign(built.get("sail_number"), palette["band"])

    # --- Below deck.
    #
    # The liner is split at the sole rather than painted in one colour: it is a
    # single moulding carrying both the sole you walk on and the settees you sit
    # on, and the brochure's photographs show those as different surfaces -- a
    # red sole against light vinyl. Split geometrically rather than by face, so
    # it stays true if the sole level moves, which is the one number below deck
    # everything else is hung off.
    assign_split(
        built.get("liner"),
        palette["sole"],
        palette["vinyl"],
        plane_z=params.SOLE_LEVEL + 0.004,
    )
    assign(built.get("deckhead"), palette["vinyl"])
    assign(built.get("forehatch_light"), palette["glass"])

    for name in (
        "bulkheads",
        "galley",
        "quarter_berth",
        "steps",
        "table",
        "companionway_frame",
        "shelf",
        "locker_doors",
    ):
        assign(built.get(name), palette["teak"])

    assign(built.get("mast_post"), palette["alloy"])
    assign(built.get("galley_fittings"), palette["chrome"])

    for name in ("cushions", "backrests"):
        assign(built.get(name), palette["cushion"])

    return palette

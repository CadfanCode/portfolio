"""
Materials.

The palette used to be sixteen flat colours -- a fast, honest starting point,
but one that reads as a CAD render rather than a boat, because nothing in it
answers the question a real surface answers just by catching a light: what is
this made of. This file now bakes that answer into a small set of raster
textures (`textures.py`) and wires them through the Principled BSDF, on top
of the same geometric assignment the flat-colour version used -- the
antifouling is still "every face below the waterline", the topside band is
still "every face below the deck edge", so the dressing survives the shapes
being re-authored exactly as before.

The band's colour is not decoration. The brochure describes the blue gelcoat
as what "naturligt delar av skrov och dack", and in white-on-white renders the
band and its windows are invisible, which is how they went missing from this
model in the first place.

Two things earn a texture over a flat colour: being close to the camera, and
being a material a photograph would show as one. The interior earns the most
attention of anything here for exactly the reason CLAUDE.md gives the camera
path: it ends in the cabin, at arm's length from the joinery.
"""

import bpy

import deck
import fittings
import params
import textures
from lib.curves import Curve


def _pbr(name, colour, roughness=0.4, metallic=0.0):
    """A flat-colour material -- still the right choice for anything a texture
    would not improve: `glass` is meant to be a mirror, `wire` is 5 mm across
    and is colour and nothing else, `band` is a painted stripe."""
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = material.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*colour, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    return material


def _textured(
    name,
    *,
    colour=None,
    colour_value=(0.6, 0.6, 0.6),
    roughness=None,
    roughness_value=0.4,
    normal=None,
    metallic=0.0,
    tile=1.0,
):
    """A material built from images rather than constants.

    `tile` is the real-world size, in metres, one copy of the texture covers.
    UV values are world-space metres throughout (`textures.project_*`), so a
    single Mapping node dividing by `tile` is what turns that into a repeating
    texture at the right physical scale -- the same node works for a 90 mm
    plank and a 700 mm sail panel, because the number that differs between
    them is `tile`, not the UV.

    Any of `colour`, `roughness`, `normal` can be left `None`: a material gets
    exactly the maps that earn their place, per the brief, and the rest fall
    back to the flat `_value` constants a `_pbr` material would use.
    """
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = material.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness_value
    if colour is None:
        bsdf.inputs["Base Color"].default_value = (*colour_value, 1.0)

    if colour is None and roughness is None and normal is None:
        return material

    nodes = material.node_tree.nodes
    links = material.node_tree.links

    coord = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (1.0 / tile, 1.0 / tile, 1.0 / tile)
    links.new(coord.outputs["UV"], mapping.inputs["Vector"])

    if colour is not None:
        node = nodes.new("ShaderNodeTexImage")
        node.image = colour
        links.new(mapping.outputs["Vector"], node.inputs["Vector"])
        links.new(node.outputs["Color"], bsdf.inputs["Base Color"])

    if roughness is not None:
        node = nodes.new("ShaderNodeTexImage")
        node.image = roughness
        links.new(mapping.outputs["Vector"], node.inputs["Vector"])
        links.new(node.outputs["Color"], bsdf.inputs["Roughness"])

    if normal is not None:
        node = nodes.new("ShaderNodeTexImage")
        node.image = normal
        links.new(mapping.outputs["Vector"], node.inputs["Vector"])
        normal_map = nodes.new("ShaderNodeNormalMap")
        links.new(node.outputs["Color"], normal_map.inputs["Color"])
        links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])

    return material


# Image sizes. 1024 only for the one surface the camera path ends at rest
# against; 512 for everything else that earns a texture; 256 for the metal
# grain, which exists only to give a specular highlight something to break
# across and is never looked at closer than the cockpit stop.
_CLOSE = 1024
_STANDARD = 512
_SMALL = 256


def create():
    """The whole palette."""
    palette = {
        "band": _pbr("band", (0.045, 0.105, 0.215), roughness=0.22),
        "glass": _pbr("glass", (0.020, 0.026, 0.032), roughness=0.06),
        "wire": _pbr("wire", (0.52, 0.54, 0.56), roughness=0.26, metallic=1.0),
    }

    # --- Gelcoat: subtle orange peel, everywhere it is moulded smooth. ------
    #
    # Real gelcoat is sprayed into a mould, not machined, and it shows: a fine,
    # irregular waviness a few millimetres across, too shallow to see as a
    # shape but enough to break a highlight up instead of running it mirror-
    # smooth down the topsides. `fbm` at a handful of octaves gives an
    # irregular bump with no repeating unit small enough to read as a pattern;
    # a single sine wave would have looked like tooling marks instead.
    gelcoat_field = textures.fbm((_STANDARD, _STANDARD), (9, 9), octaves=4, seed=20)
    gelcoat_height = (gelcoat_field - 0.5) * 0.010
    gelcoat_normal = textures.make_image(
        "gelcoat_normal",
        textures.normal_from_height(gelcoat_height, strength=30.0),
        non_color=True,
    )
    gelcoat_roughness = textures.grey_image(
        "gelcoat_roughness",
        0.14 + 0.10 * textures.speckle((_STANDARD, _STANDARD), cells=(9, 9), seed=21),
    )
    palette["gelcoat"] = _textured(
        "gelcoat",
        colour_value=(0.82, 0.82, 0.80),
        roughness=gelcoat_roughness,
        normal=gelcoat_normal,
        tile=0.12,
    )

    # Moulded diamond non-slip: a raised stud grid, same base gelcoat colour --
    # a real non-slip panel is not painted a different colour, it is the same
    # gelcoat moulded with a texture in it. See `_is_nonslip` for where this
    # actually gets used; a flat plane of it would look like a bathroom floor,
    # which is why it is confined to the tread surfaces geometrically rather
    # than painted over the whole deck.
    nonslip_tile = 0.36
    nonslip_pitch_m = 0.015  # a Treadmaster panel's own diamond pitch, ~15 mm
    nonslip_height = textures.diamond_nonslip(
        (_STANDARD, _STANDARD), pitch_px=nonslip_pitch_m / nonslip_tile * _STANDARD
    ) * 0.0015
    nonslip_normal = textures.make_image(
        "nonslip_normal",
        textures.normal_from_height(nonslip_height, strength=35.0),
        non_color=True,
    )
    nonslip_roughness = textures.grey_image(
        "nonslip_roughness",
        0.30 + 0.10 * textures.speckle((_STANDARD, _STANDARD), cells=(24, 24), seed=22),
    )
    palette["gelcoat_nonslip"] = _textured(
        "gelcoat_nonslip",
        colour_value=(0.80, 0.80, 0.78),
        roughness=nonslip_roughness,
        normal=nonslip_normal,
        tile=nonslip_tile,
    )

    # Marine blue below the waterline, not black. Antifouling comes in both
    # and the blue is what the boat is painted; it also does something black
    # cannot, which is stay a colour in shadow -- a black bottom against dark
    # water reads as a hole where the hull ought to be. A faint roughness
    # speckle keeps it from being the one perfectly even surface on the boat;
    # nobody sees it close enough to want more than that.
    antifoul_speckle = textures.speckle((_SMALL, _SMALL), cells=(14, 14), seed=30)
    antifoul_roughness = textures.grey_image(
        "antifoul_roughness", 0.55 + 0.10 * antifoul_speckle
    )
    palette["antifoul"] = _textured(
        "antifoul", colour_value=(0.028, 0.068, 0.145), roughness=antifoul_roughness, tile=0.6
    )

    # --- Metal: one grain, three materials. ---------------------------------
    #
    # A single anodised/drawn grain, shared by chrome, alloy and spar. Sharing
    # is not just economy: the grain is a normal map, which carries no colour
    # or brightness of its own, only a direction for a highlight to run in --
    # three different metals are three different colours and roughnesses over
    # the same grain, not three different grains.
    grain_field = textures.directional_grain((_SMALL, _SMALL), seed=40, streak_weight=0.55)
    grain_height = (grain_field - 0.5) * 0.003
    metal_normal = textures.make_image(
        "metal_grain_normal",
        textures.normal_from_height(grain_height, strength=45.0),
        non_color=True,
    )

    palette["spar"] = _textured(
        "spar",
        colour_value=(0.055, 0.058, 0.062),
        roughness_value=0.34,
        metallic=0.65,
        normal=metal_normal,
        tile=0.25,
    )
    # Polished stainless rather than true chrome, which is also what the
    # fittings are. At metallic 1.0 and roughness 0.09 these came out as black
    # mirrors: a mirror shows what is around it, and what is around this boat
    # is a dark sky. Backing both off puts enough diffuse in to read as bright
    # metal without waiting for an environment to light it.
    palette["chrome"] = _textured(
        "chrome",
        colour_value=(0.84, 0.86, 0.88),
        roughness_value=0.21,
        metallic=0.85,
        normal=metal_normal,
        tile=0.05,
    )
    palette["engine"] = _pbr("engine", (0.10, 0.11, 0.12), roughness=0.38)
    # The cowling, which is a different thing from the leg under it. An
    # outboard is never one colour: the cowling is painted sheet or moulded
    # plastic in the maker's livery and the leg below it is the dark grey-black
    # everything anti-fouled and submerged gets. Painted in one grey the whole
    # motor read as a single turned object -- a percolator hung on the transom
    # -- because the only thing telling a cowling from a leg is where one stops
    # being one colour and starts being the other.
    palette["engine_cowl"] = _pbr("engine_cowl", (0.44, 0.45, 0.46), roughness=0.30)
    # Bare drawn aluminium: brighter and less anodised than `spar`, which is
    # the black extrusion the mast is. The compression post is the one of
    # these anybody gets close to.
    palette["alloy"] = _textured(
        "alloy",
        colour_value=(0.62, 0.64, 0.66),
        roughness_value=0.30,
        metallic=0.85,
        normal=metal_normal,
        tile=0.15,
    )

    # --- Cloth. --------------------------------------------------------------
    #
    # Dacron. Not white: sailcloth is warm and it is translucent, and a pure
    # white sail against a pale sky is a hole in the picture. The seams are
    # what actually reads as a sail rather than a bedsheet -- real panels run
    # roughly a boom's fraction of the chord apart, so `planks` here is a
    # cloth's panels, not planks, reusing the same seam generator because a
    # seam is a seam: a straight line of slightly compressed, slightly
    # shadowed cloth.
    sail_weave = textures.woven_cloth((_STANDARD, _STANDARD), threads=44, seed=50)
    sail_seam, sail_tint = textures.plank_seams(
        (_STANDARD, _STANDARD), planks=5, seam_width=0.04, seed=51
    )
    sail_colour = textures.colour_image(
        "sailcloth_colour",
        (0.855, 0.845, 0.815),
        sail_tint * 0.3 + (sail_weave - 0.5),
        amount=0.05,
    )
    sail_height = (sail_weave - 0.5) * 0.0006 - sail_seam * 0.0012
    sail_normal = textures.make_image(
        "sailcloth_normal",
        textures.normal_from_height(sail_height, strength=40.0),
        non_color=True,
    )
    # Roughness stays a flat value rather than a fourth image: the metallic
    # and roughness channels of every textured material get composited into
    # one glTF metallicRoughness texture on export regardless of what format
    # they started as, so a roughness image never actually keeps the JPEG
    # saving `colour_image` gets elsewhere -- it is always re-encoded PNG.
    # Worth it for `teak`, where the varnish sheen genuinely varies with the
    # grain; not worth doubling the file for here, where the weave and the
    # seams already carry the material in colour and bump.
    palette["sailcloth"] = _textured(
        "sailcloth", colour=sail_colour, roughness_value=0.66, normal=sail_normal, tile=1.1
    )

    # Cushion fabric, the warmest thing on the boat. The brochure's interior
    # photographs are teak, cream vinyl and brown cloth, and the cloth is what
    # stops the other two reading as a bathroom. Soft is roughness and bump
    # together: a matte surface whose highlight, such as it is, breaks up over
    # a weave rather than running smooth.
    cushion_weave = textures.woven_cloth((_STANDARD, _STANDARD), threads=52, seed=60)
    cushion_colour = textures.colour_image(
        "cushion_colour", (0.335, 0.245, 0.180), cushion_weave - 0.5, amount=0.10
    )
    cushion_height = (cushion_weave - 0.5) * 0.0018
    cushion_normal = textures.make_image(
        "cushion_normal",
        textures.normal_from_height(cushion_height, strength=13.0),
        non_color=True,
    )
    # Flat roughness rather than a fourth image -- see the note by `sailcloth`.
    #
    # Tile and normal strength both came down from 0.30 m and 25. A 52-thread
    # weave over 300 mm is a 6 mm thread, which is upholstery webbing rather
    # than cloth, and at strength 25 it read from across the cabin as a grid of
    # dots -- pegboard, not fabric. Cloth is meant to be a texture you can see
    # is there and cannot resolve.
    palette["cushion"] = _textured(
        "cushion", colour=cushion_colour, roughness_value=0.86, normal=cushion_normal, tile=0.17
    )

    # Sailcover canvas: a coarser, plainer weave than the cushions -- acrylic
    # not upholstery -- so its own thread count is lower and it carries no
    # colour tint, just enough bump that it does not sit in the same "flat
    # cloth" bucket the cushions would otherwise share it with.
    canvas_weave = textures.woven_cloth((_STANDARD, _STANDARD), threads=20, seed=61)
    canvas_height = (canvas_weave - 0.5) * 0.0020
    canvas_normal = textures.make_image(
        "canvas_normal",
        textures.normal_from_height(canvas_height, strength=20.0),
        non_color=True,
    )
    palette["canvas"] = _textured(
        "canvas",
        colour_value=(0.30, 0.33, 0.38),
        roughness_value=0.78,
        normal=canvas_normal,
        tile=0.4,
    )

    # --- Below deck. ---------------------------------------------------------
    #
    # Teak, and two different materials for it, because the brochure's teak is
    # two different surfaces: the interior joinery is varnished -- a wet-look
    # sheen sitting on top of the grain, so its roughness has to vary with the
    # grain rather than being one number -- and the exterior teak (the tiller,
    # the cockpit grating) is left bare and has gone the grey-brown of
    # weathered timber, which is also why its grain is coarser and its seams
    # are wider: bare teak checks along the grain in a way varnish hides.
    teak_grain = textures.directional_grain((_CLOSE, _CLOSE), seed=70, streak_weight=0.6)
    teak_seam, teak_tint = textures.plank_seams(
        (_CLOSE, _CLOSE), planks=8, seam_width=0.05, seed=71
    )
    # The per-plank tint is held well down against the grain. Teak-faced ply is
    # cut from one flitch and laid up to match, so neighbouring planks differ
    # by a shade, not by a colour. At the 0.6 this first carried, the saloon
    # bulkhead came out as alternating light and dark boards -- which is what
    # a floor looks like, not what a boat's joinery looks like.
    teak_variance = (teak_grain - 0.5) * 0.7 + teak_tint * 0.22
    teak_colour = textures.colour_image(
        "teak_colour", (0.335, 0.196, 0.100), teak_variance, amount=0.11
    )
    teak_sheen = textures.speckle((_CLOSE, _CLOSE), cells=(14, 14), seed=72)
    # Downsampled to `_STANDARD` rather than generated fresh at that size: the
    # varnish sheen is a slow variation next to the grain and the seams, and
    # subsampling the same field it is built from keeps it registered with
    # them without a second noise call. Roughness is always recomposited into
    # its own texture on export anyway (see `grey_image`), so nothing here
    # keeps the resolution `teak_colour` and `teak_normal` are packed at --
    # this is the one map in the whole palette that earns 1024, and it is not
    # this one.
    # Satin, not gloss, and the three modulations are small on purpose. The
    # first version subtracted up to 0.65 from a base of 0.5, so the varnish
    # bottomed out at zero roughness over much of its area -- a mirror. In the
    # saloon render that put a blown-out white highlight across the whole
    # table and made every bulkhead read as french-polished mahogany. Interior
    # boat varnish is a rubbed satin finish: it lifts a highlight, it does not
    # reflect the cabin back at you. Base 0.44, and the darkest this now goes
    # is about 0.25.
    teak_roughness = textures.grey_image(
        "teak_roughness",
        (0.44 - 0.10 * teak_sheen - 0.06 * (1 - teak_grain) - 0.05 * teak_seam)[::2, ::2],
    )
    teak_height = (teak_grain - 0.5) * 0.0006 - teak_seam * 0.0020
    teak_normal = textures.make_image(
        "teak_normal", textures.normal_from_height(teak_height, strength=30.0), non_color=True
    )
    palette["teak"] = _textured(
        "teak", colour=teak_colour, roughness=teak_roughness, normal=teak_normal, tile=0.55
    )

    weathered_grain = textures.directional_grain(
        (_STANDARD, _STANDARD), seed=80, streak_weight=0.5
    )
    weathered_seam, weathered_tint = textures.plank_seams(
        (_STANDARD, _STANDARD), planks=6, seam_width=0.08, seed=81
    )
    weathered_variance = (weathered_grain - 0.5) * 0.9 + weathered_tint * 0.5
    weathered_colour = textures.colour_image(
        "teak_exterior_colour", (0.44, 0.36, 0.28), weathered_variance, amount=0.16
    )
    weathered_roughness = textures.grey_image(
        "teak_exterior_roughness",
        0.60 + 0.15 * (1 - weathered_grain) + 0.10 * weathered_seam,
    )
    weathered_height = (weathered_grain - 0.5) * 0.0012 - weathered_seam * 0.0028
    weathered_normal = textures.make_image(
        "teak_exterior_normal",
        textures.normal_from_height(weathered_height, strength=25.0),
        non_color=True,
    )
    palette["teak_exterior"] = _textured(
        "teak_exterior",
        colour=weathered_colour,
        roughness=weathered_roughness,
        normal=weathered_normal,
        tile=0.45,
    )

    # Vinyl liner and deckhead: light, faintly padded, low sheen. The dimples
    # are a shallow, isotropic bump -- `speckle` rather than `fbm` on its own,
    # because a padded liner is stitched or moulded in a repeating pattern of
    # roughly even dents, not an irregular wood-like waviness.
    vinyl_dimple = textures.speckle((_STANDARD, _STANDARD), cells=(22, 22), seed=90, octaves=2)
    vinyl_colour = textures.colour_image(
        "vinyl_colour", (0.79, 0.77, 0.73), vinyl_dimple - 0.5, amount=0.03
    )
    vinyl_roughness = textures.grey_image("vinyl_roughness", 0.62 + 0.10 * vinyl_dimple)
    vinyl_height = (vinyl_dimple - 0.5) * 0.0022
    vinyl_normal = textures.make_image(
        "vinyl_normal", textures.normal_from_height(vinyl_height, strength=18.0), non_color=True
    )
    palette["vinyl"] = _textured(
        "vinyl", colour=vinyl_colour, roughness=vinyl_roughness, normal=vinyl_normal, tile=0.30
    )

    # The cabin sole: red-brown, walked on, moulded rather than varnished --
    # duller and grainier than the interior teak it sits beside, with a finer
    # speckle riding on top for grip.
    sole_grain = textures.directional_grain((_STANDARD, _STANDARD), seed=100, streak_weight=0.5)
    sole_seam, sole_tint = textures.plank_seams(
        (_STANDARD, _STANDARD), planks=7, seam_width=0.06, seed=101
    )
    sole_grip = textures.speckle((_STANDARD, _STANDARD), cells=(40, 40), seed=102)
    sole_variance = (sole_grain - 0.5) * 0.5 + sole_tint * 0.4
    sole_colour = textures.colour_image(
        "sole_colour", (0.30, 0.095, 0.078), sole_variance, amount=0.12
    )
    sole_roughness = textures.grey_image(
        "sole_roughness", 0.62 + 0.10 * sole_grip - 0.08 * sole_seam
    )
    sole_height = (sole_grain - 0.5) * 0.0004 - sole_seam * 0.0016 + (sole_grip - 0.5) * 0.0003
    sole_normal = textures.make_image(
        "sole_normal", textures.normal_from_height(sole_height, strength=28.0), non_color=True
    )
    palette["sole"] = _textured(
        "sole", colour=sole_colour, roughness=sole_roughness, normal=sole_normal, tile=0.5
    )

    # --- What the detailing tracks needed and the palette did not have. ------
    #
    # These arrived with the running rigging, the outboard and the cabin
    # fit-out. Each is here because nothing already in the palette could stand
    # in for it without lying about what the object is made of, which is a
    # higher bar than it sounds: `chrome` was doing duty for the anchor, and a
    # galvanised anchor that reflects like a pushpit is worse than a grey one.

    # Rope. The one material on the boat whose texture is its whole shape: a
    # braided line is a helix of over-and-under, and at 10 mm diameter that
    # helix is the only thing distinguishing it from a bent grey cylinder.
    # `woven_cloth` at a coarse thread count run down a small tile gives the
    # over-under; the tile is deliberately near the rope's own diameter so one
    # repeat is one lay of the braid rather than a fabric print.
    rope_weave = textures.woven_cloth((_STANDARD, _STANDARD), threads=14, seed=140)
    rope_colour = textures.colour_image(
        "rope_colour", (0.74, 0.72, 0.66), rope_weave - 0.5, amount=0.10
    )
    rope_roughness = textures.grey_image("rope_roughness", 0.80 - 0.08 * rope_weave)
    rope_normal = textures.make_image(
        "rope_normal",
        textures.normal_from_height((rope_weave - 0.5) * 0.0016, strength=26.0),
        non_color=True,
    )
    palette["rope"] = _textured(
        "rope",
        colour=rope_colour,
        roughness=rope_roughness,
        normal=rope_normal,
        tile=0.045,
    )

    # Curtain cloth. The cushions' weave at a different scale and a lighter,
    # cooler colour -- the same bolt of fabric would be wrong, because a
    # curtain hangs in front of a window and a cushion is sat on, so the
    # curtain is the thing that has light coming through it and reads pale.
    curtain_weave = textures.woven_cloth((_STANDARD, _STANDARD), threads=48, seed=141)
    curtain_colour = textures.colour_image(
        "curtain_colour", (0.62, 0.55, 0.46), curtain_weave - 0.5, amount=0.09
    )
    curtain_roughness = textures.grey_image("curtain_roughness", 0.88 - 0.06 * curtain_weave)
    curtain_normal = textures.make_image(
        "curtain_normal",
        textures.normal_from_height((curtain_weave - 0.5) * 0.0009, strength=20.0),
        non_color=True,
    )
    palette["curtain"] = _textured(
        "curtain",
        colour=curtain_colour,
        roughness=curtain_roughness,
        normal=curtain_normal,
        tile=0.10,
    )

    # Moulded black plastic: clutch bodies, spreader boots, the winch handle's
    # pocket, nav light housings. Matte, slightly rough, no grain worth an
    # image -- these are small and never closer than the cockpit.
    palette["plastic_black"] = _pbr("plastic_black", (0.045, 0.047, 0.050), roughness=0.52)

    # White mouldings that are plainly not gelcoat: the mainsail's headboard,
    # the batten ends. Brighter and glossier than sailcloth so they read as
    # hardware against the cloth they are sewn into.
    palette["plastic_white"] = _pbr("plastic_white", (0.80, 0.80, 0.78), roughness=0.30)

    # Signal red, for the two objects on the boat that are red because a rule
    # says so rather than because somebody chose it: the fire extinguisher and
    # the portable fuel tank.
    palette["paint_red"] = _pbr("paint_red", (0.42, 0.045, 0.035), roughness=0.36)

    # Galvanising, not stainless. An anchor and its chain are hot-dipped: dull,
    # grey, slightly blue, and emphatically not polished. Reusing `chrome` here
    # put a mirror on the stemhead.
    palette["galvanised"] = _textured(
        "galvanised",
        colour_value=(0.44, 0.45, 0.47),
        roughness_value=0.62,
        normal=metal_normal,
        metallic=0.80,
        tile=0.12,
    )

    # Book cloth. Dark, matte, and warm enough not to read as a row of bricks.
    palette["book_cloth"] = _pbr("book_cloth", (0.185, 0.135, 0.115), roughness=0.80)

    return palette


def assign(obj, material):
    """Give an object a single material."""
    if obj is None:
        return
    obj.data.materials.clear()
    obj.data.materials.append(material)


def assign_split(obj, below, above, plane_z=0.0, axis="z"):
    """Two materials, split by a plane.

    Used for the boot top -- everything under the waterline is antifouled --
    and the sole/settee split in the liner, and nothing else needs to know
    where either plane is.

    The mesh is cut along the plane first. Without that, faces can only
    belong wholly to one side, and the boot top comes out as a visible
    staircase wherever a face straddles the waterline.
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


NONSLIP_EDGE_MARGIN = 0.090
"""Smooth gelcoat border outboard of the diamond pattern, deck edge inward.
A real Treadmaster panel stops short of the edge by about this much -- close
enough that a stanchion base or a toe rail never lands half on, half off the
moulded pattern. Not read from anywhere because it is a texture-panel layout
choice, not a hull or deck dimension -- there is nothing in `params.py` this
could be wrong against."""

NONSLIP_MIN_SLOPE = 0.55
"""How close to horizontal a face has to be, as its world-space normal's own
z-component, to carry the pattern at all. Below it: a coachroof shoulder, a
cockpit well side, a hatch surround -- nothing a foot lands square on, and
nothing a real non-slip panel is ever moulded onto."""

_COACHROOF_HALF_WIDTH = Curve(params.COACHROOF_HALF_WIDTH)


def _companionway_garage_half_width(station):
    """Half-width of the raised panel over the companionway -- the sliding
    hatch's own garage -- gated to the coachroof's actual span.

    `COACHROOF_HALF_WIDTH` holds its own end value outside that span (see its
    docstring in `params.py`, and `deck._coachroof_half_width`, which reads
    it the same way) -- necessary there so a lofted surface has no seam where
    the roof fades out, but exactly the leak that would put a smooth strip on
    the bare foredeck if this function did not gate it explicitly.
    """
    if not (params.COACHROOF_START <= station <= params.COACHROOF_END):
        return 0.0
    return _COACHROOF_HALF_WIDTH(station) * deck.companionway_raise_width(station)


def _is_nonslip(edge_half_width, station, x_abs, normal_z):
    """Whether a deck face gets the moulded diamond pattern.

    Three exclusions, all geometric: too steep to be a tread surface, too
    close to the deck edge (the smooth margin a toe rail or stanchion base
    needs), or over the companionway hatch and its sliding garage. Everything
    else on the deck's own top surface gets the pattern -- which is the
    brief's split, done from the deck's own surface functions rather than
    picked face by face, so it survives the hull being re-authored the same
    way `assign_deck`'s band test already does.
    """
    if abs(normal_z) < NONSLIP_MIN_SLOPE:
        return False
    if x_abs > edge_half_width(station) - NONSLIP_EDGE_MARGIN:
        return False
    if x_abs < _companionway_garage_half_width(station):
        return False
    return True


def assign_deck(
    obj, band_surface, material_deck, material_band, material_nonslip, tolerance=0.020
):
    """Split the deck moulding into its topside band, smooth gelcoat, and
    moulded non-slip.

    The band is found geometrically rather than by picking faces, so the
    split survives the sheer, the band height or the cockpit moving. A face is
    band if it actually sits on the band's surface -- its centre within
    `tolerance` of where that surface is at its own station and height.

    Looser rules do not work here, and both failures were visible. Testing
    only "below the deck edge" painted the whole cockpit as topsides, since
    its sole is far below. Adding "faces sideways and is well outboard" fixed
    that but still caught the cockpit's outer edge near the transom, where the
    side deck narrows to a centimetre and that edge is as far outboard as the
    band is.

    Everything the band test rejects is either the tread surface or a moulded
    shoulder around it; `_is_nonslip` tells the two apart.
    """
    if obj is None:
        return

    obj.data.materials.clear()
    obj.data.materials.append(material_deck)
    obj.data.materials.append(material_band)
    obj.data.materials.append(material_nonslip)

    normal_matrix = obj.matrix_world.to_3x3()
    for polygon in obj.data.polygons:
        centre = polygon.center
        station = params.y_to_station(centre.y)
        expected = band_surface(station, centre.z)

        if expected is not None and abs(abs(centre.x) - expected) < tolerance:
            polygon.material_index = 1
            continue

        world_normal = normal_matrix @ polygon.normal
        if _is_nonslip(deck.deck_edge_half_width, station, abs(centre.x), world_normal.z):
            polygon.material_index = 2
        else:
            polygon.material_index = 0


def apply(built, band_surface):
    """Dress the whole boat."""
    palette = create()

    # UV projection. Most objects here have no UV layer at all, so the box
    # projector runs unconditionally over everything -- it is a no-op wherever
    # a UV layer already exists, which after the two calls below is the hull
    # and the sails.
    #
    # The deck and the cabin sole are not given a bespoke projector of their
    # own, even though the brief calls both out as deserving one: both are
    # made almost entirely of faces facing straight up, camber and all, so the
    # generic per-face projector already gives them exactly what a purpose-built
    # top-down one would -- `u, v = world.x, world.y` is what it falls back to
    # for a Z-facing face regardless. A bespoke version would be the same three
    # lines under a different name.
    textures.ensure_uvs(built.get("hull"), kind="cylindrical")
    for name in ("mainsail", "genoa"):
        textures.ensure_uvs(built.get(name), kind="planar")
    for obj in built.values():
        textures.ensure_uvs(obj, kind="box")

    assign_split(built.get("hull"), palette["antifoul"], palette["gelcoat"])
    assign(built.get("rubrail"), palette["band"])

    for name in ("keel", "skeg", "rudder"):
        assign(built.get(name), palette["antifoul"])

    for name in ("deck_fwd", "deck_aft"):
        assign_deck(
            built.get(name),
            band_surface,
            palette["gelcoat"],
            palette["band"],
            palette["gelcoat_nonslip"],
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
    # The cowling parts company with the leg at the height `fittings` built the
    # join at, asked for rather than guessed, so the line stays on the seam if
    # the motor is ever re-proportioned.
    assign_split(
        built.get("outboard"),
        palette["engine"],
        palette["engine_cowl"],
        plane_z=fittings.outboard_cowl_base(),
    )

    # Running rigging. Every line on the boat is one object and one material:
    # halyards, sheets, the vang, the topping lift and their coils. Real
    # halyards are colour-coded and these are not, which is a deliberate
    # economy -- the codes only mean anything to somebody who already knows
    # them, and a rope reads as a rope from its lay, not its colour.
    for name in ("running_rigging", "sheets", "boltropes"):
        assign(built.get(name), palette["rope"])

    for name in (
        "mast_clutches",
        "spreader_boots",
        "winch_handle",
        "nav_lights",
        "masthead_unit",
    ):
        assign(built.get(name), palette["plastic_black"])

    for name in ("mooring_cleats", "boarding_ladder", "gooseneck", "sail_cringles"):
        assign(built.get(name), palette["chrome"])

    assign(built.get("genoa_track"), palette["alloy"])
    assign(built.get("anchor"), palette["galvanised"])
    # Tank and fuel line are one mesh, so they get one material, and black is
    # the one that can be both. Red was the first choice -- portable tanks
    # usually are -- but the line is 11 mm of tube running up over the coaming
    # and down to the motor, and in red it read as a pair of scaffold poles
    # pitched in the footwell rather than as a hose. The tank loses a little by
    # being black; the cockpit gains a great deal.
    assign(built.get("outboard_fuel"), palette["plastic_black"])

    # The tiller and the cockpit flooring are the only teak anybody sees from
    # outside the boat, and they are the two pieces the cockpit stop is
    # closest to. Bare and weathered, not the interior's varnished material --
    # see `teak_exterior` in `create`.
    for name in ("tiller", "cockpit_grating", "pulpit_block"):
        assign(built.get(name), palette["teak_exterior"])

    # --- Sails.
    for name in ("mainsail", "genoa"):
        assign(built.get(name), palette["sailcloth"])
    assign(built.get("sail_number"), palette["band"])
    for name in ("mainsail_headboard", "mainsail_battens"):
        assign(built.get(name), palette["plastic_white"])

    # --- Below deck.
    #
    # The liner is split at the sole rather than painted in one colour: it is
    # a single moulding carrying both the sole you walk on and the settees you
    # sit on, and the brochure's photographs show those as different surfaces
    # -- a red sole against light vinyl. Split geometrically rather than by
    # face, so it stays true if the sole level moves, which is the one number
    # below deck everything else is hung off.
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

    # --- The cabin's small stuff.
    #
    # `grabrails`, `washboard` and `bilge_hatch` are teak because that is what
    # they are made of on the real boat. The bilge hatch had a case for taking
    # the sole's colour instead and blending into the floor; teak wins because
    # a hatch you cannot find is a hatch that reads as a seam in the moulding,
    # and this one has a fiddle and a pull on it that only make sense as wood.
    for name in ("grabrails", "washboard", "bilge_hatch"):
        assign(built.get(name), palette["teak"])

    assign(built.get("step_grabrail"), palette["chrome"])
    assign(built.get("cabin_lamp"), palette["chrome"])
    assign(built.get("curtains"), palette["curtain"])
    assign(built.get("books"), palette["book_cloth"])
    assign(built.get("fire_extinguisher"), palette["paint_red"])

    return palette

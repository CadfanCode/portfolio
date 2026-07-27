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
import numpy as np

import deck
import fittings
import params
import textures


def _glass(name, roughness=None, tile=0.3):
    """Smoked window acrylic: a tinted sheet you can see through, not a slab.

    The windows used to be opaque near-black, which is right looked at from the
    water -- a dark glossy pane against a bright sky -- and wrong from the one
    place the camera path actually spends time, which is inside the cabin. From
    in there an opaque pane is a navy slot painted on the topside, and the boat's
    own windows, the most recognisable thing on it, read as a stripe.

    So it is semi-transparent now: alpha blend rather than real refraction, which
    is the cheap, in-keeping trick (CLAUDE.md: fake effects over simulation).
    `KHR_materials_transmission` would refract the sea correctly and cost a whole
    render pass to do it; a tinted 45%-opaque sheet with a low roughness reads as
    smoked glass from either side and costs nothing but a sort. The tint is a
    cool grey-blue, dark enough to still carry a sky reflection on the outside.
    """
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = material.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (0.055, 0.075, 0.095, 0.45)
    bsdf.inputs["Roughness"].default_value = 0.06
    bsdf.inputs["Metallic"].default_value = 0.0
    # Alpha comes off the base colour's fourth channel; the exporter reads the
    # blend method for glTF's alphaMode, so both have to be set.
    bsdf.inputs["Alpha"].default_value = 0.45
    material.blend_method = "BLEND"

    # An optional faint frosting. A pane this smooth is a perfect mirror of the
    # sky, and a perfect mirror is the one thing a real window at sea never is:
    # it carries a fine salt haze that scatters the reflection just enough to
    # soften its edge. A shallow roughness map breaks the mirror without
    # clouding the glass -- you still see through it, the sky reflected on it
    # just stops being a razor line. World-scale UVs like every other map here.
    if roughness is not None:
        nodes = material.node_tree.nodes
        links = material.node_tree.links
        coord = nodes.new("ShaderNodeTexCoord")
        mapping = nodes.new("ShaderNodeMapping")
        mapping.inputs["Scale"].default_value = (1.0 / tile, 1.0 / tile, 1.0 / tile)
        links.new(coord.outputs["UV"], mapping.inputs["Vector"])
        node = nodes.new("ShaderNodeTexImage")
        node.image = roughness
        links.new(mapping.outputs["Vector"], node.inputs["Vector"])
        links.new(node.outputs["Color"], bsdf.inputs["Roughness"])
    return material


def _coat(bsdf, coat, coat_roughness):
    """Wire a clear top layer onto a Principled BSDF.

    A single roughness value can only ever describe one specular lobe, and a
    varnished or gelcoat surface has two: a broad, soft reflection off the wood
    or the pigment underneath, and a second, tighter, brighter one off the clear
    film sitting on top of it. That second lobe is what makes varnish read as
    *varnished* rather than as matte wood the colour of varnish. `Coat Weight`
    above zero is exported as `KHR_materials_clearcoat`, so it survives to the
    web the same way the base layer does -- it is not a viewport-only nicety.

    Kept off unless asked for: most of the boat is a single-lobe surface (cloth,
    antifouling, drawn metal) where a coat would be a lie about the finish.
    """
    if coat <= 0.0:
        return
    bsdf.inputs["Coat Weight"].default_value = coat
    bsdf.inputs["Coat Roughness"].default_value = coat_roughness


def _pbr(name, colour, roughness=0.4, metallic=0.0, coat=0.0, coat_roughness=0.06):
    """A flat-colour material -- still the right choice for anything a texture
    would not improve: `wire` is 5 mm across and is colour and nothing else,
    `band` is a painted stripe."""
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = material.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*colour, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    _coat(bsdf, coat, coat_roughness)
    return material


def _emissive(name, colour, strength=1.0, base=(0.02, 0.02, 0.02), roughness=0.5):
    """A surface that gives off light rather than only taking it.

    The one material kind this palette had no answer for, and the cabin now has
    two things that need it: the shade of the desk lamp, and the VHF's display.

    It is emission and not a light. `build.py` exports with
    `export_lights=False` -- glTF's punctual lights are an extension, and the
    app's own lighting rig is authored in `PortfolioWorld` where it can follow
    the weather -- so nothing here can put a lamp in the scene. What emission
    does is make the *source* look like one: a shade whose inside is brighter
    than anything around it, which is what tells an eye that a lamp is switched
    on. The pool of light under it is the app's job, and the two have to agree.

    `Emission Strength` above 1 exports as `KHR_materials_emissive_strength`,
    which three.js reads; below 1 it is folded into the emissive factor. Either
    way it survives the trip, which a shader-node glow would not.
    """
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = material.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*base, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = 0.0
    bsdf.inputs["Emission Color"].default_value = (*colour, 1.0)
    bsdf.inputs["Emission Strength"].default_value = strength
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
    coat=0.0,
    coat_roughness=0.06,
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
    _coat(bsdf, coat, coat_roughness)
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


# Image sizes. 2048 only for the base colour of the one surface the camera path
# ends at rest against -- the varnished teak, at arm's length in the cabin --
# where the grain and the wear want more pixels than anything else on the boat.
# Its normal and roughness stay at half that (see the teak block): a 2048 normal
# map is a megabyte of PNG for detail a tiled grain does not resolve, and the
# saving there pays for the sharper colour. 512 for everything else that earns a
# texture; 256 for the metal grain, which exists only to give a specular
# highlight something to break across and is never looked at closer than the
# cockpit stop.
_CLOSE = 2048
_STANDARD = 512
_SMALL = 256


def create():
    """The whole palette."""
    # A faint frost on the windows so the sky they reflect has a soft edge, not
    # a razor one -- salt haze, standing in for the real thing. Small tile, low
    # cell count: a fine, even scatter rather than visible streaks.
    glass_frost = textures.fbm((_SMALL, _SMALL), (5, 5), octaves=3, seed=110)
    glass_roughness = textures.grey_image("glass_roughness", 0.05 + 0.09 * glass_frost)

    palette = {
        # The painted topside stripe is glossy gelcoat like the hull it sits in,
        # so it earns the same clear coat -- without it the band reads as a matte
        # decal laid over a shiny hull.
        "band": _pbr("band", (0.045, 0.105, 0.215), roughness=0.22, coat=0.3, coat_roughness=0.05),
        "glass": _glass("glass", roughness=glass_roughness),
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
    # Gelcoat is a pigmented base under a clear resin skin -- the deep wet shine
    # on a hull's topsides is that skin, a second specular lobe the orange-peel
    # roughness underneath cannot produce on its own. A modest coat: enough to
    # wet the topsides, not so much the whole hull turns to chrome once the
    # environment map is reflecting in it.
    palette["gelcoat"] = _textured(
        "gelcoat",
        colour_value=(0.82, 0.82, 0.80),
        roughness=gelcoat_roughness,
        normal=gelcoat_normal,
        coat=0.25,
        coat_roughness=0.05,
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
    # Lacquered brass, for the bulkhead instruments. Warm and gold rather than
    # the grey of `chrome` and `alloy`, and duller: ship's brass is lacquered
    # against the salt and reads as a soft satin gold, not a mirror -- the same
    # reasoning that keeps `chrome` off 1.0 metallic keeps this off it too, so it
    # carries diffuse warmth without waiting for an environment to light it.
    # Same drawn grain as the other metals, finer, since the piece is small.
    palette["brass"] = _textured(
        "brass",
        colour_value=(0.63, 0.44, 0.16),
        roughness_value=0.33,
        metallic=0.82,
        normal=metal_normal,
        tile=0.04,
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

    # Cushion fabric, the warmest thing on the boat -- and now the only strong
    # colour below deck.
    #
    # It used to be brown, sourced to the brochure's own interior photographs:
    # teak, cream vinyl and brown cloth. That was faithful and it was also the
    # whole problem. Teak is brown, the sole is brown, the joinery is brown, and
    # a brown cushion on top of it left a cabin with one hue in it -- which is
    # what the owner saw and asked to have fixed. Marine blue is the replacement
    # and it is not an arbitrary one: it is the boat's own topside band
    # (`palette["band"]`), the one colour the hull already carries, brought
    # below. The cabin and the outside of the boat now agree about what colour
    # this boat is.
    #
    # Patterned, not plain. A single flat blue over eight square metres of
    # settee is a paint job; a woven stripe is what marine upholstery of the
    # period actually is, and it is the cheapest possible thing to add -- one
    # extra mask multiplied into the colour image. `stripes` at a duty of 0.16
    # is a pinstripe: pairs of fine lighter lines in the ground, close enough
    # together to read as texture at the far end of the cabin and as a stripe
    # at arm's length, which is the range the camera path actually covers.
    #
    # Soft is roughness and bump together: a matte surface whose highlight, such
    # as it is, breaks up over a weave rather than running smooth.
    cushion_weave = textures.woven_cloth((_STANDARD, _STANDARD), threads=52, seed=60)
    cushion_stripe = textures.stripes((_STANDARD, _STANDARD), 6, duty=0.16, axis=1)
    cushion_colour = textures.colour_image(
        "cushion_colour",
        (0.088, 0.145, 0.245),
        (cushion_weave - 0.5) + cushion_stripe * 1.15,
        amount=0.14,
    )
    cushion_height = (cushion_weave - 0.5) * 0.0018 + cushion_stripe * 0.0006
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

    # The two pillow fabrics. Both borrow the cushion's own weave and its normal
    # map, run at a smaller tile -- a scatter cushion is a smaller object than a
    # settee and a thread on it should not be bigger -- with the pattern doing
    # all the work of telling them apart.
    #
    # Borrowed rather than generated fresh, unlike `curtain`, which makes its
    # own weave at its own thread count. The difference is what the two are: a
    # curtain is a different cloth from a cushion and reads wrong sharing one, a
    # scatter cushion is upholstery exactly like the settee it sits on. A second
    # 512-pixel normal map for a surface indistinguishable from one already in
    # the file is 800 KB of GLB for nothing, and normal maps are the one thing
    # here that cannot be JPEG (see `textures.make_image`).
    #
    # Two fabrics, and not one, because the pillows go on in pairs and a pair of
    # identical cushions is one cushion modelled twice. Two, and not six,
    # because this is a 7.6 m boat and not a soft-furnishings catalogue.
    pillow_weave = cushion_weave

    # A Breton stripe: broad navy bands on off-white, which is the one pattern
    # that is nautical without being a print of an anchor on a cushion.
    breton = textures.stripes((_STANDARD, _STANDARD), 5, duty=0.42, axis=0)
    stripe_rgba = np.empty((_STANDARD, _STANDARD, 4), dtype=np.float32)
    ground = np.array([0.760, 0.735, 0.680])
    navy = np.array([0.075, 0.125, 0.225])
    stripe_rgb = ground + (navy - ground) * breton[..., None]
    stripe_rgb *= (1.0 + 0.10 * (pillow_weave - 0.5))[..., None]
    stripe_rgba[..., :3] = np.clip(stripe_rgb, 0.0, 1.0)
    stripe_rgba[..., 3] = 1.0
    palette["pillow_stripe"] = _textured(
        "pillow_stripe",
        colour=textures.make_image(
            "pillow_stripe_colour", stripe_rgba, file_format="JPEG"
        ),
        roughness_value=0.88,
        normal=cushion_normal,
        tile=0.24,
    )

    # And a plain one to sit next to it: a warm sailcloth cream, which is the
    # colour the deckhead already is, so the pair read as belonging to the boat
    # rather than as two cushions from different rooms.
    palette["pillow_plain"] = _textured(
        "pillow_plain",
        colour=textures.colour_image(
            "pillow_plain_colour", (0.545, 0.480, 0.395), pillow_weave - 0.5, amount=0.11
        ),
        roughness_value=0.90,
        normal=cushion_normal,
        tile=0.14,
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
    # Wear and grime -- the whole reason this surface stops reading as a swatch
    # of "varnished teak material" and starts reading as *this* boat's joinery.
    # A real cabin is not uniform: the varnish has been handled dull in broad
    # soft patches (a hand on a bulkhead, a shoulder against the hull side), and
    # dirt has settled darker in the low-frequency hollows and along the seams.
    # Two fields, both large and soft -- low cell counts -- so they read as
    # history, not as a pattern printed on the wood.
    teak_wear = textures.speckle((_CLOSE, _CLOSE), cells=(4, 4), seed=73)
    teak_grime = textures.fbm((_CLOSE, _CLOSE), (6, 6), octaves=4, seed=74)
    # The per-plank tint is held well down against the grain. Teak-faced ply is
    # cut from one flitch and laid up to match, so neighbouring planks differ
    # by a shade, not by a colour. At the 0.6 this first carried, the saloon
    # bulkhead came out as alternating light and dark boards -- which is what
    # a floor looks like, not what a boat's joinery looks like.
    #
    # Grime pulls the colour down where it settles; rubbed-through wear lifts it,
    # since worn varnish shows the paler, drier wood underneath. Both small, so
    # the surface still reads as one board, just not a machined one.
    teak_variance = (
        (teak_grain - 0.5) * 0.7
        + teak_tint * 0.22
        - (teak_grime - 0.5) * 0.35
        + (teak_wear - 0.5) * 0.25
    )
    teak_colour = textures.colour_image(
        "teak_colour", (0.335, 0.196, 0.100), teak_variance, amount=0.11
    )
    teak_sheen = textures.speckle((_CLOSE, _CLOSE), cells=(14, 14), seed=72)
    # Roughness and normal are both packed at a quarter and a half of the base
    # colour's `_CLOSE`, subsampling the same fields they are built from so they
    # stay registered with the colour without a second noise call. The base
    # colour is the map the eye resolves at arm's length in the cabin, so it
    # keeps the full 2048; a 2048 roughness or normal is pixels spent on
    # variation too fine to see and a PNG several times larger for it.
    #
    # Satin, not gloss, and the modulations are small on purpose. The first
    # version subtracted up to 0.65 from a base of 0.5, so the varnish bottomed
    # out at zero roughness over much of its area -- a mirror. In the saloon
    # render that put a blown-out white highlight across the whole table and
    # made every bulkhead read as french-polished mahogany. Interior boat
    # varnish is a rubbed satin finish: it lifts a highlight, it does not reflect
    # the cabin back at you. Base 0.44; the worn patches (`teak_wear`) dull it
    # further, up toward 0.6, which is what makes the wear read as wear.
    teak_roughness = textures.grey_image(
        "teak_roughness",
        (
            0.44
            - 0.10 * teak_sheen
            - 0.06 * (1 - teak_grain)
            - 0.05 * teak_seam
            + 0.18 * teak_wear
        )[::4, ::4],
    )
    teak_height = (teak_grain - 0.5) * 0.0006 - teak_seam * 0.0020
    teak_normal = textures.make_image(
        "teak_normal",
        textures.normal_from_height(teak_height[::2, ::2], strength=30.0),
        non_color=True,
    )
    # Varnished, so a clear coat over the grain -- the second, tighter specular
    # lobe that a single roughness value cannot carry (see `_coat`). Rubbed
    # satin, so the coat's own roughness is well up from a gloss: it lifts a
    # soft highlight along the joinery, it does not turn the saloon into a
    # mirror. This is the surface the whole camera path is pointed at, so it is
    # the one the coat matters most on.
    palette["teak"] = _textured(
        "teak",
        colour=teak_colour,
        roughness=teak_roughness,
        normal=teak_normal,
        coat=0.55,
        coat_roughness=0.12,
        tile=0.55,
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

    # The cabin sole. This boat's is plain moulded fibreglass -- not the teak-
    # and-holly or the varnished ply the material first assumed. That earlier
    # version carried plank seams and a wood grain, and it read as exactly what
    # it was built to be, a wooden floor, which is the one thing this sole is
    # not. So: no seams and no grain. What is left is a light grey gelcoat,
    # a shade cooler and darker than the vinyl liner so the floor still reads
    # as a different surface from the settees, with a fine even speckle for the
    # moulded-in non-slip that a real glass sole has underfoot -- the only
    # texture on it, and a shallow one, because a fibreglass sole is meant to
    # look wiped-down and hard, not soft.
    sole_grip = textures.speckle((_STANDARD, _STANDARD), cells=(46, 46), seed=102)
    sole_colour = textures.colour_image(
        "sole_colour", (0.63, 0.63, 0.62), sole_grip - 0.5, amount=0.03
    )
    sole_roughness = textures.grey_image("sole_roughness", 0.44 + 0.10 * sole_grip)
    sole_height = (sole_grip - 0.5) * 0.0006
    sole_normal = textures.make_image(
        "sole_normal", textures.normal_from_height(sole_height, strength=22.0), non_color=True
    )
    palette["sole"] = _textured(
        "sole", colour=sole_colour, roughness=sole_roughness, normal=sole_normal, tile=0.35
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
    palette["plastic_white"] = _pbr(
        "plastic_white", (0.80, 0.80, 0.78), roughness=0.30, coat=0.3, coat_roughness=0.08
    )

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

    # --- The shelf, and the two exhibits on it.

    # Book cloth. One weave and one normal map, shared, with a colour image per
    # binding -- `params.BOOK_CLOTHS` says why there are six and what each is
    # for. The weave is the point: buckram is a coarse, sized linen and it is
    # the only thing that separates a cloth binding from a painted block at the
    # range the cabin stop has on this shelf. Small tile, because a book is a
    # small object and a 200 mm weave on a 30 mm spine is a tablecloth.
    book_weave = textures.woven_cloth((_SMALL, _SMALL), threads=34, seed=142)
    book_normal = textures.make_image(
        "book_normal",
        textures.normal_from_height((book_weave - 0.5) * 0.0011, strength=16.0),
        non_color=True,
    )
    for index, colour in enumerate(params.BOOK_CLOTHS):
        palette[f"book_cloth_{index}"] = _textured(
            f"book_cloth_{index}",
            colour=textures.colour_image(
                f"book_cloth_{index}_colour", colour, book_weave - 0.5, amount=0.09
            ),
            roughness_value=0.82,
            normal=book_normal,
            tile=0.035,
        )

    # The page block. Not white: paper on a boat goes cream in a season and
    # foxed in a decade, and a page block is seen edge-on -- what shows is the
    # stack of edges, which is why this carries a fine banding along one axis
    # rather than being flat. Slightly rough, no coat: nothing about a cut page
    # edge is shiny.
    page_grain = textures.stripes((_SMALL, _SMALL), 150, duty=0.5, softness=1.0, axis=0)
    palette["book_pages"] = _textured(
        "book_pages",
        colour=textures.colour_image(
            "book_pages_colour", (0.735, 0.700, 0.605), page_grain - 0.5, amount=0.07
        ),
        roughness_value=0.72,
        tile=0.030,
    )

    # --- The chart table.

    # The chart itself: the one place in this model where a texture is the
    # object rather than its finish. See `textures.chart_paper`.
    palette["chart"] = _textured(
        "chart",
        colour=textures.make_image(
            "chart_colour",
            np.concatenate(
                [
                    textures.chart_paper((_STANDARD, _STANDARD), seed=311),
                    np.ones((_STANDARD, _STANDARD, 1), dtype=np.float32),
                ],
                axis=2,
            ).astype(np.float32),
            file_format="JPEG",
        ),
        roughness_value=0.74,
        tile=0.62,
    )

    # Green enamel, for the lamp shade. A banker's-lamp green, which is a
    # deliberate anachronism on a Swedish production boat and the right one:
    # it is the only saturated colour in the after end of the cabin, it is
    # instantly readable as "desk", and a lamp the same colour as everything
    # around it is a lamp nobody notices is there.
    palette["enamel_green"] = _pbr(
        "enamel_green", (0.055, 0.135, 0.085), roughness=0.22,
        coat=0.5, coat_roughness=0.05,
    )

    # What the lamp is throwing. Warm, and bright enough to blow out against a
    # cabin lit at daylight levels -- an emissive surface has to beat the
    # ambient it sits in or it reads as pale paint. See `_emissive`.
    palette["lamp_glow"] = _emissive(
        "lamp_glow", (1.0, 0.845, 0.620), strength=7.0, base=(0.9, 0.85, 0.78)
    )

    # Briar, for the pipe. Not `teak`: teak is a plank material, tiled and
    # grained at plank scale, and run over a 40 mm bowl it is a stripe. This is
    # a close, swirling grain at a tile the size of the object, with the deep
    # polish a smoked pipe has and nothing else in the cabin does.
    briar_grain = textures.fbm((_SMALL, _SMALL), (7, 7), octaves=4, seed=143)
    palette["briar"] = _textured(
        "briar",
        colour=textures.colour_image(
            "briar_colour", (0.175, 0.088, 0.048), briar_grain - 0.5, amount=0.10
        ),
        roughness_value=0.24,
        tile=0.05,
        coat=0.4,
        coat_roughness=0.10,
    )

    # Pencil lacquer. Yellow, because a pencil is, and because it is 8 mm of
    # object that has to be found by eye on a chart.
    palette["paint_yellow"] = _pbr(
        "paint_yellow", (0.62, 0.44, 0.055), roughness=0.30,
        coat=0.4, coat_roughness=0.08,
    )

    # The safe: a hard, dark, satin enamel over steel. Nearly black with a
    # green in it, which is what small strongboxes of every era actually are
    # and is also the only way to keep it from reading as a hole in the
    # worktop -- pure black below deck is a silhouette, not an object.
    palette["safe_paint"] = _textured(
        "safe_paint",
        colour_value=(0.052, 0.062, 0.058),
        roughness_value=0.34,
        normal=metal_normal,
        tile=0.20,
        coat=0.25,
        coat_roughness=0.12,
    )

    # --- The VHF.

    # Its display, lit. Cold against the desk lamp's warm, which is most of
    # what makes an instrument read as electronic rather than as a painted
    # panel, and dimmer than the lamp because a backlight is not a light
    # source you look into.
    palette["vhf_screen"] = _emissive(
        "vhf_screen", (0.30, 0.72, 0.66), strength=1.3, base=(0.04, 0.09, 0.09),
        roughness=0.18,
    )

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
    """Cut the mesh along an axis-aligned plane, leaving both halves joined."""
    from lib.mesh import bisect

    normal = {"x": (1.0, 0.0, 0.0), "y": (0.0, 1.0, 0.0), "z": (0.0, 0.0, 1.0)}[axis]
    bisect(obj, tuple(plane_z * n for n in normal), normal)


NONSLIP_EDGE_MARGIN = 0.090
"""Smooth gelcoat border outboard of the diamond pattern, deck edge inward.
A real Treadmaster panel stops short of the edge by about this much -- close
enough that a stanchion base or a toe rail never lands half on, half off the
moulded pattern. Not read from anywhere because it is a texture-panel layout
choice, not a hull or deck dimension -- there is nothing in `params.py` this
could be wrong against."""

NONSLIP_MIN_SLOPE = 0.55
"""How close to horizontal a face has to be, as its world-space normal's own
z-component, to carry the pattern at all. Below it: a cockpit well side, a
hatch surround -- nothing a foot lands square on, and nothing a real non-slip
panel is ever moulded onto."""


def _coachroof_structure_half_width(station):
    """Half-width of the whole raised centre structure -- the coachroof top,
    its shoulders and the flared side down to the deck -- outside which lies the
    flat side deck a foot actually walks on.

    The non-slip pattern belongs on that side deck and on the flat foredeck, and
    nowhere on the coachroof: not the top, which nobody stands on on a boat this
    size, and not the sloped sides, which a moulded panel is never laid on. The
    earlier version excluded only the sliding-hatch garage on the very crown and
    left the pattern over the rest of the roof and down its gables -- which is
    what the owner saw, and asked to have taken off.

    `coachroof_half_width + COACHROOF_SIDE_FLARE` is exactly where
    `deck._forward_section` lands the foot of the coachroof side on the side deck
    (`base_x` there), so this is the structure's own outline rather than a guess
    at it. Gated to the coachroof's length because `coachroof_half_width` holds
    its end value fore and aft of the roof -- necessary for a seamless loft, but
    it would otherwise put a smooth strip down the middle of the bare foredeck.
    """
    if not (params.COACHROOF_START <= station <= params.COACHROOF_END):
        return 0.0
    return deck.coachroof_half_width(station) + params.COACHROOF_SIDE_FLARE


def _is_nonslip(edge_half_width, station, x_abs, normal_z):
    """Whether a deck face gets the moulded diamond pattern.

    Three exclusions, all geometric: too steep to be a tread surface, too
    close to the deck edge (the smooth margin a toe rail or stanchion base
    needs), or anywhere on the raised centre structure. Everything else on the
    deck's own top surface -- the side decks and the flat foredeck -- gets the
    pattern, done from the deck's own surface functions rather than picked face
    by face, so it survives the hull being re-authored the same way
    `assign_deck`'s band test already does.
    """
    if abs(normal_z) < NONSLIP_MIN_SLOPE:
        return False
    if x_abs > edge_half_width(station) - NONSLIP_EDGE_MARGIN:
        return False
    if x_abs < _coachroof_structure_half_width(station):
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
        world_normal = normal_matrix @ polygon.normal
        expected = band_surface(station, centre.z)

        # The band is a topside stripe: a near-vertical surface below the deck
        # edge, so its faces point outward, not up. Requiring that -- rather than
        # position alone -- is what fixes the checkerboard that used to appear at
        # the stem. There the topsides come to a point and the flat foredeck runs
        # out to almost nothing, so the band surface and a deck face's own x land
        # within `tolerance` of each other while the face is still facing the sky;
        # on position alone every other triangle up at the bow flipped to band
        # blue. A deck face never faces sideways, so the normal tells the two
        # apart where their positions cannot.
        on_band = (
            expected is not None
            and abs(abs(centre.x) - expected) < tolerance
            and abs(world_normal.z) < 0.6
        )
        if on_band:
            polygon.material_index = 1
        elif _is_nonslip(deck.deck_edge_half_width, station, abs(centre.x), world_normal.z):
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
    # The window openings are lined in the cabin's own colour rather than the
    # band's. They are seen from inside far more than from out -- from the water
    # a reveal is 18 mm of edge behind a smoked pane -- and from inside they are
    # continuous with the lining they are cut through.
    assign(built.get("window_reveals"), palette["vinyl"])
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
        "nav_lights",
        "masthead_unit",
    ):
        assign(built.get(name), palette["plastic_black"])

    for name in ("mooring_cleats", "boarding_ladder", "gooseneck", "sail_cringles"):
        assign(built.get(name), palette["chrome"])

    assign(built.get("genoa_track"), palette["alloy"])

    # The winch handle, the bow anchor, the outboard fuel tank and the pulpit
    # chafe block were removed from the build at the owner's request; `.get()`
    # would make their assignments harmless no-ops, but a line that can never
    # fire is worse than no line.

    # The tiller and the cockpit flooring are the only teak anybody sees from
    # outside the boat, and they are the two pieces the cockpit stop is
    # closest to. Bare and weathered, not the interior's varnished material --
    # see `teak_exterior` in `create`.
    for name in ("tiller", "cockpit_grating", "cockpit_shelves"):
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
        "aft_bulkhead",
        "galley",
        "quarter_berth",
        "steps",
        "table",
        "companionway_frame",
        "shelf",
    ):
        assign(built.get(name), palette["teak"])

    assign(built.get("mast_post"), palette["alloy"])

    # The bulkhead brass: three objects rather than one, for the three materials
    # a glazed instrument is -- the brass case, the pale dial behind the glass,
    # and the glass itself. Split by object, the way the windows and their panes
    # already are.
    assign(built.get("instruments"), palette["brass"])
    assign(built.get("instrument_dials"), palette["plastic_white"])
    assign(built.get("instrument_glass"), palette["glass"])

    # Every soft surface below deck is one material: settee and berth cushions,
    # the saloon backrests, and the forepeak bumper that comes back joined to
    # them. Owner's brief was that the blue should reach all of them including
    # the bow, and it does so here by having been true all along -- there is one
    # `cushion` and these are the two objects made of it, so recolouring the
    # cabin was a change to a colour and not to a list.
    for name in ("cushions", "backrests"):
        assign(built.get(name), palette["cushion"])

    # The pillows, in the two fabrics, and the cord round every one of their
    # seams. The piping is `rope` and that is not a stand-in: upholstery cord
    # is a laid three-strand exactly like a rope, at a fifth of the diameter,
    # and `rope`'s whole texture is the over-and-under of that lay.
    assign(built.get("pillows_stripe"), palette["pillow_stripe"])
    assign(built.get("pillows_plain"), palette["pillow_plain"])
    assign(built.get("pillow_piping"), palette["rope"])

    # --- The cabin's small stuff.
    #
    # `grabrails` and `bilge_hatch` are teak because that is what they are made
    # of on the real boat. The bilge hatch had a case for taking the sole's
    # colour instead and blending into the floor; teak wins because a hatch you
    # cannot find is a hatch that reads as a seam in the moulding, and this one
    # has a fiddle and a pull on it that only make sense as wood.
    #
    # The washboard, curtains, fire extinguisher and step grab rail that used
    # to be dressed here were removed from the build at the owner's request;
    # `.get()` would make their assignments harmless no-ops, but a line that
    # can never fire is worse than no line.
    for name in ("grabrails", "bilge_hatch"):
        assign(built.get(name), palette["teak"])

    assign(built.get("cabin_lamp"), palette["chrome"])

    # --- The shelf. One object per binding, because glTF gives a mesh one
    # material and a shelf of one-coloured books is what this used to be. The
    # loop is over the palette's own list rather than over a count written
    # here, so adding a seventh cloth is one line in `params.BOOK_CLOTHS`.
    #
    # All but the last: the last cloth belongs to the two placeholder books,
    # which are objects of their own rather than a pool, so that the app can
    # hang one exhibit on each by mesh name.
    for index in range(len(params.BOOK_CLOTHS) - 1):
        assign(built.get(f"books_{index}"), palette[f"book_cloth_{index}"])
    for name in ("book_resume", "book_about"):
        assign(built.get(name), palette[f"book_cloth_{len(params.BOOK_CLOTHS) - 1}"])
    assign(built.get("book_pages"), palette["book_pages"])
    assign(built.get("book_gilt"), palette["brass"])

    # --- The chart table. Five objects and seven materials, which is the whole
    # argument for taking the sink and the hob out: a worktop with a chart, a
    # lamp, a pipe and a safe on it is worth more of both than a worktop with a
    # stainless bowl in it, at the one stop the camera path ends at.
    assign(built.get("desk_lamp"), palette["brass"])
    assign(built.get("desk_lamp_shade"), palette["enamel_green"])
    assign(built.get("desk_lamp_glow"), palette["lamp_glow"])
    assign(built.get("desk_chart"), palette["chart"])
    assign(built.get("desk_safe"), palette["safe_paint"])
    assign(built.get("desk_safe_brass"), palette["brass"])
    assign(built.get("desk_pipe"), palette["briar"])
    assign(built.get("desk_pipe_stem"), palette["plastic_black"])
    assign(built.get("desk_pencils"), palette["paint_yellow"])

    # --- The VHF: the set, and its display lit behind the fascia.
    assign(built.get("vhf"), palette["plastic_black"])
    assign(built.get("vhf_screen"), palette["vhf_screen"])

    return palette

"""
Procedural raster textures.

glTF does not export Blender's shader nodes -- a Noise or Voronoi texture
renders correctly in the viewport and exports as a flat colour, because the
exporter can only write what a real-time renderer can sample: images. So every
texture used here is a numpy array, baked once at build time, packed into the
`.blend` and carried into the GLB as actual pixel data.

Two kinds of thing live in this file:

    a small kit of generators -- noise, grain, seams, weave, speckle, a
    moulded diamond pattern -- that combine into the materials the boat
    actually needs, and

    UV projection, because most objects in this model have no UV layer at
    all. Projection is world-scale throughout: a face's UV comes from its own
    world-space position (`obj.matrix_world`, not local coordinates), so a
    20 mm plank seam is 20 mm wide on every object it appears on, and doubling
    the size of some unrelated part of the boat cannot stretch it.

Every generator is built to tile (`np.roll` rather than clamping at the
edges), because every one of them is sampled through a Mapping node set to
repeat at a real-world tile size -- see `materials.py`.

Colour images are sRGB; roughness and normal images are Non-Color, because
they are data, not something intended to look right to an eye that has not
been told what it is looking at.
"""

import math
import os
import tempfile

import bpy
import numpy as np

import params


# --------------------------------------------------------------------------
# The kit
# --------------------------------------------------------------------------


def value_noise(shape, cells, seed=0):
    """Tileable value noise: a random lattice, smoothly interpolated.

    `cells` is the lattice resolution, not a frequency in the abstract sense
    -- `(8, 8)` really does mean the pattern repeats 8 times across the image,
    which is what makes it possible to reason about a plank width or a grain
    pitch in real units when this is combined with a known tile size.

    Wraps rather than clamping (`% cy`, `% cx` on the lattice indices), so
    the result tiles seamlessly -- required, since every texture here is
    sampled through a repeating Mapping node.
    """
    h, w = shape
    cy, cx = max(1, int(round(cells[0]))), max(1, int(round(cells[1])))
    rng = np.random.default_rng(seed)
    lattice = rng.random((cy, cx))

    ys = np.linspace(0.0, cy, h, endpoint=False)
    xs = np.linspace(0.0, cx, w, endpoint=False)
    y0 = np.floor(ys).astype(int) % cy
    x0 = np.floor(xs).astype(int) % cx
    y1 = (y0 + 1) % cy
    x1 = (x0 + 1) % cx
    yf = ys - np.floor(ys)
    xf = xs - np.floor(xs)

    def smoothstep(t):
        return t * t * (3 - 2 * t)

    sy = smoothstep(yf)[:, None]
    sx = smoothstep(xf)[None, :]

    v00 = lattice[np.ix_(y0, x0)]
    v01 = lattice[np.ix_(y0, x1)]
    v10 = lattice[np.ix_(y1, x0)]
    v11 = lattice[np.ix_(y1, x1)]

    top = v00 * (1 - sx) + v01 * sx
    bottom = v10 * (1 - sx) + v11 * sx
    return top * (1 - sy) + bottom * sy


def fbm(shape, cells, octaves=4, seed=0, persistence=0.5, lacunarity=2.0):
    """Fractal sum of `value_noise` octaves, each finer and fainter than the
    last. Normalised so the result stays in roughly `0..1` regardless of how
    many octaves are asked for."""
    total = np.zeros(shape)
    amplitude = 1.0
    amplitude_sum = 0.0
    cy, cx = cells
    for octave in range(octaves):
        total += amplitude * value_noise(shape, (cy, cx), seed=seed + octave * 101)
        amplitude_sum += amplitude
        amplitude *= persistence
        cy *= lacunarity
        cx *= lacunarity
    return total / amplitude_sum


def directional_grain(
    shape, seed=0, streak_cells=(2, 22), fine_cells=(48, 48), streak_weight=0.7
):
    """Wood or drawn-metal grain: long streaks along the image's rows (V),
    finer variation across its columns (U).

    Every object this is used on is UV-projected so that the "long" axis of
    the real object -- a plank's run, a rail's length -- lands on V. A low
    cell count in that direction gives streaks that barely change along their
    own length; a high cell count across it gives the fine variation between
    streaks that actually reads as grain.
    """
    coarse = fbm(shape, streak_cells, octaves=2, seed=seed)
    fine = fbm(shape, fine_cells, octaves=3, seed=seed + 977)
    return streak_weight * coarse + (1 - streak_weight) * fine


def plank_seams(shape, planks, seam_width=0.06, seed=0):
    """Planking across the image's columns (U): a seam mask and a per-plank
    brightness tint, both constant along V -- the strips run the length of
    whatever they are laid on.

    `seam_width` is a fraction of one plank's own width, not of the image, so
    it stays the same proportion of a plank however many planks are asked
    for. Returns `(seam, tint)`, both `shape`-sized: `seam` is 0 away from a
    joint and ramps to 1 at one, `tint` is a per-plank value centred on 0.
    """
    h, w = shape
    plank_w = w / planks
    x = np.arange(w)
    plank_id = np.floor(x / plank_w).astype(int)
    frac = x / plank_w - plank_id
    dist_to_edge = np.minimum(frac, 1.0 - frac)
    seam_1d = np.clip(1.0 - dist_to_edge / seam_width, 0.0, 1.0)
    seam_1d = seam_1d * seam_1d * (3 - 2 * seam_1d)

    rng = np.random.default_rng(seed)
    tint_lookup = rng.normal(0.0, 1.0, planks + 2)
    tint_1d = tint_lookup[plank_id % len(tint_lookup)]

    seam = np.broadcast_to(seam_1d, (h, w))
    tint = np.broadcast_to(tint_1d, (h, w))
    return seam, tint


def woven_cloth(shape, threads, seed=0):
    """A basket weave: two perpendicular thread directions, alternating which
    one rides on top cell by cell, the way plain weave actually crosses.

    Warp and weft are both a single cosine, high where a thread crests. Which
    one is used at a given cell is decided by a checkerboard over the same
    thread pitch, so the height field itself carries the over-under crossing
    rather than just implying it with two overlaid ripples.
    """
    h, w = shape
    y, x = np.mgrid[0:h, 0:w].astype(np.float64)
    period_x = w / threads
    period_y = h / threads

    warp = 0.5 + 0.5 * np.cos(2 * np.pi * x / period_x)
    weft = 0.5 + 0.5 * np.cos(2 * np.pi * y / period_y)
    checker = (np.floor(x / period_x).astype(int) + np.floor(y / period_y).astype(int)) % 2
    height = np.where(checker == 0, warp, weft)

    height += 0.06 * fbm(shape, (threads * 2, threads * 2), octaves=2, seed=seed)
    return height


def speckle(shape, cells=(30, 30), seed=0, octaves=3):
    """Fine, isotropic mottling -- cast metal, orange peel, a grip surface --
    normalised to fill `0..1` so it can be used as a bump or a roughness
    variation without knowing in advance how much contrast `fbm` happened to
    produce at these cell counts."""
    field = fbm(shape, cells, octaves=octaves, seed=seed)
    lo, hi = field.min(), field.max()
    return (field - lo) / (hi - lo + 1e-9)


def diamond_nonslip(shape, pitch_px, margin=0.32):
    """A moulded diamond non-slip pattern: flat-topped studs on a diagonal
    grid, tapering to a groove between them.

    Built in a lattice rotated 45 degrees (`u, v` below) so that a square cell
    in that space is a diamond in image space -- rather than drawing diamonds
    directly, which is the harder shape to get the tiling right on. `d` is the
    Manhattan distance from the nearest stud centre; `margin` is how much of
    each cell's radius is given to the taper down into the groove, the rest
    held flat on top the way an actual moulded stud is, not carved to a point.
    """
    h, w = shape
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float64)
    u = (xx + yy) / pitch_px
    v = (xx - yy) / pitch_px
    fu = u - np.round(u)
    fv = v - np.round(v)
    d = np.abs(fu) + np.abs(fv)

    t = np.clip((0.5 - d) / margin, 0.0, 1.0)
    return t * t * (3 - 2 * t)


def normal_from_height(height, strength=4.0):
    """Tangent-space normal map from a height field, by Sobel gradient.

    A 3x3 Sobel rather than a plain central difference: the wider kernel
    averages out the single-pixel noise that `fbm`'s finest octave leaves in,
    which a naive one-pixel gradient turns into a normal map that sparkles
    under a moving light instead of reading as a surface.

    `np.roll` wraps at the edges rather than clamping, matching every
    generator above -- a clamped edge would show as a seam exactly where two
    copies of the tile meet.

    Returns an `(h, w, 4)` float array, ready for `make_image`. Blender's
    Normal Map node expects `+Y` up, which is what this produces without
    needing to flip a channel -- the same convention glTF's `NORMAL_TEXTURE`
    uses, so nothing has to change between the two.
    """
    top = np.roll(height, 1, axis=0)
    bottom = np.roll(height, -1, axis=0)
    left = np.roll(height, 1, axis=1)
    right = np.roll(height, -1, axis=1)
    top_left = np.roll(top, 1, axis=1)
    top_right = np.roll(top, -1, axis=1)
    bottom_left = np.roll(bottom, 1, axis=1)
    bottom_right = np.roll(bottom, -1, axis=1)

    gx = (top_right + 2 * right + bottom_right) - (top_left + 2 * left + bottom_left)
    gy = (bottom_left + 2 * bottom + bottom_right) - (top_left + 2 * top + top_right)

    nx = -gx * strength
    ny = -gy * strength
    nz = np.ones_like(height)
    length = np.sqrt(nx * nx + ny * ny + nz * nz)
    nx, ny, nz = nx / length, ny / length, nz / length

    rgba = np.empty(height.shape + (4,), dtype=np.float32)
    rgba[..., 0] = nx * 0.5 + 0.5
    rgba[..., 1] = ny * 0.5 + 0.5
    rgba[..., 2] = nz * 0.5 + 0.5
    rgba[..., 3] = 1.0
    return rgba


# --------------------------------------------------------------------------
# Image creation
# --------------------------------------------------------------------------


def make_image(name, rgba, non_color=False, file_format=None):
    """Pack an `(h, w, 4)` float array (`0..1`) as a Blender image.

    Packed immediately rather than left pointing at a file: these images
    exist only as pixels this script generated, there is no file to point at,
    and the glTF exporter only embeds an image it can read the bytes of --
    packed or on disk. Packed is the only option that survives `reset_scene`
    finding nothing on disk to have written.

    `file_format="JPEG"` trades exactness for size on anything that does not
    need it -- a base colour or a roughness map is a look, not a value a
    shader depends on being exact, and JPEG runs several times smaller than
    PNG on the kind of smooth, high-entropy noise every generator above
    produces. Normal maps are never asked for this: a blocky JPEG artefact in
    a height field exports as a wrong direction for the light, and that is
    worth the extra kilobytes to avoid.

    Getting a *packed* image the exporter will actually treat as JPEG takes a
    round trip through a real file: Blender only recognises an image as
    JPEG if its `source` is `FILE`, and `bpy.data.images.new` always creates
    one with `source == 'GENERATED'`, whatever `file_format` is set to
    afterwards -- the glTF exporter falls back to PNG for anything that
    is not `FILE`-sourced. The temp directory this writes to is the
    Flatpak's own private one, not the host's, but that is fine here: the
    file is read back in the same process that wrote it, a few lines later.
    """
    h, w = rgba.shape[:2]
    image = bpy.data.images.new(name, width=w, height=h, alpha=True)
    image.colorspace_settings.name = "Non-Color" if non_color else "sRGB"
    image.pixels.foreach_set(np.ascontiguousarray(rgba, dtype=np.float32).ravel())

    if file_format is None:
        image.pack()
        return image

    image.file_format = file_format
    directory = tempfile.mkdtemp(prefix="maxi77_textures_")
    path = os.path.join(directory, name + "." + file_format.lower())
    image.filepath_raw = path
    image.save()
    bpy.data.images.remove(image)

    reloaded = bpy.data.images.load(path)
    reloaded.name = name
    reloaded.colorspace_settings.name = "Non-Color" if non_color else "sRGB"
    reloaded.pack()
    os.remove(path)
    os.rmdir(directory)
    return reloaded


def grey_image(name, field, non_color=True, file_format=None):
    """Pack a single-channel field as a grey RGBA image -- what a roughness
    map is, since the Principled BSDF reads only its luminance.

    PNG by default, unlike `colour_image` -- and it is not just a default,
    asking for JPEG here would be actively counterproductive. Blender's glTF
    exporter always composites whatever feeds Roughness (and Metallic) into a
    single metallicRoughness texture of its own, synthesized fresh at export
    time, so a roughness image never keeps the file format it was packed
    with -- it comes out PNG regardless. Packing it as JPEG first would only
    bake a lossy round-trip into the pixels before that re-encoding, for a
    size saving that never actually reaches the exported file.
    """
    rgba = np.empty(field.shape + (4,), dtype=np.float32)
    rgba[..., 0] = rgba[..., 1] = rgba[..., 2] = field
    rgba[..., 3] = 1.0
    return make_image(name, rgba, non_color=non_color, file_format=file_format)


def colour_image(name, base_rgb, variance=None, amount=0.08, file_format="JPEG"):
    """A flat base colour, tinted by a roughly zero-mean `variance` field.

    `amount` is how far the base can swing either way -- a plank at `+1`
    comes out `amount` lighter, one at `-1` comes out `amount` darker, so the
    same `base_rgb` reads as a set of similar-but-not-identical boards rather
    than as paint. JPEG by default: see `make_image`.
    """
    shape = variance.shape if variance is not None else (4, 4)
    rgba = np.empty(shape + (4,), dtype=np.float32)
    for channel in range(3):
        value = base_rgb[channel]
        if variance is not None:
            value = np.clip(value + variance * amount, 0.0, 1.0)
        rgba[..., channel] = value
    rgba[..., 3] = 1.0
    return make_image(name, rgba, file_format=file_format)


# --------------------------------------------------------------------------
# UV projection
# --------------------------------------------------------------------------
#
# All three functions below write world-space coordinates straight into the
# UV layer, in metres. A material's own Mapping node divides that down to
# whatever tile size its texture actually is (see `materials.py`) -- so the
# UV values here never need to know what is going to be sampled through them,
# and the same object would not need re-unwrapping if a material's tile size
# changed.


def _has_uvs(obj):
    return obj is None or len(obj.data.uv_layers) > 0


def project_box_uvs(obj):
    """Per-face planar projection, axis chosen by each face's own dominant
    world-space normal -- the fallback for anything that is not one of the
    three shapes below, which is most of the boat: stanchions, winches,
    lockers, the pulpit, the berths.

    Correct for anything that is mostly made of faces facing one of six
    directions, which a bolted-on fitting or a flat panel always is. It comes
    apart on a genuinely curved surface, which is exactly why the hull below
    does not use it.
    """
    if _has_uvs(obj):
        return

    mesh = obj.data
    uv_layer = mesh.uv_layers.new(name="UVMap")
    matrix = obj.matrix_world
    normal_matrix = matrix.to_3x3()

    for polygon in mesh.polygons:
        normal = normal_matrix @ polygon.normal
        ax, ay, az = abs(normal.x), abs(normal.y), abs(normal.z)
        for loop_index in polygon.loop_indices:
            vertex_index = mesh.loops[loop_index].vertex_index
            world = matrix @ mesh.vertices[vertex_index].co
            if az >= ax and az >= ay:
                u, v = world.x, world.y
            elif ay >= ax:
                u, v = world.x, world.z
            else:
                u, v = world.y, world.z
            uv_layer.data[loop_index].uv = (u, v)


def project_planar_uvs(obj):
    """A single planar projection for the whole object, along its own
    area-weighted average normal -- for a sheet that is nearly flat but tilted
    (a sail, set at an angle to every world axis), where per-face box
    projection would pick a different pair of axes wherever the surface's
    curvature nudges a face past 45 degrees and show as a seam in the panel
    pattern that is supposed to run in straight lines.

    The averaging is the same area-weighted sum `lib.mesh.face_towards` uses
    to decide which way a sheet is facing; here it decides which plane to flatten
    the sheet onto, once, for every face.
    """
    if _has_uvs(obj):
        return

    from mathutils import Vector

    mesh = obj.data
    matrix = obj.matrix_world
    normal_matrix = matrix.to_3x3()

    total = Vector((0.0, 0.0, 0.0))
    for polygon in mesh.polygons:
        world_normal = (normal_matrix @ polygon.normal).normalized()
        total += world_normal * polygon.area
    if total.length < 1e-9:
        project_box_uvs(obj)
        return
    normal = total.normalized()

    up_hint = Vector((0.0, 0.0, 1.0))
    if abs(normal.dot(up_hint)) > 0.95:
        up_hint = Vector((0.0, 1.0, 0.0))
    u_axis = normal.cross(up_hint).normalized()
    v_axis = normal.cross(u_axis).normalized()

    uv_layer = mesh.uv_layers.new(name="UVMap")
    for polygon in mesh.polygons:
        for loop_index in polygon.loop_indices:
            vertex_index = mesh.loops[loop_index].vertex_index
            world = matrix @ mesh.vertices[vertex_index].co
            uv_layer.data[loop_index].uv = (world.dot(u_axis), world.dot(v_axis))


def project_cylindrical_uvs(obj):
    """Unwrap the hull around its girth and along its length, so a fine bump
    -- gelcoat orange peel -- keeps a constant texel density over a curved
    surface that a box projection cannot: box projection's dominant axis
    flips at four seams down a round hull, and a bump this fine shows every
    one of them as a grain of little boxes rather than a curved skin.

    `U` is an angle about a pole held above the sheer, scaled by the point's
    own distance from that pole -- close enough to true arc length that a bump
    a few millimetres across cannot tell the difference. `V` is the station
    itself, in metres, which is exact. The pole is derived from `SHEER`'s own
    highest point rather than picked, so it stays clear of the hull however
    the sheer curve is reshaped.
    """
    if _has_uvs(obj):
        return

    pole_z = max(height for _, height in params.SHEER) + 0.5

    mesh = obj.data
    uv_layer = mesh.uv_layers.new(name="UVMap")
    matrix = obj.matrix_world

    for polygon in mesh.polygons:
        for loop_index in polygon.loop_indices:
            vertex_index = mesh.loops[loop_index].vertex_index
            world = matrix @ mesh.vertices[vertex_index].co
            radius = math.hypot(world.x, pole_z - world.z)
            theta = math.atan2(world.x, pole_z - world.z)
            uv_layer.data[loop_index].uv = (theta * radius, world.y)


def ensure_uvs(obj, kind="box"):
    """Apply whichever projection an object's shape calls for, but only if it
    has none -- so this can be called unconditionally over the whole boat
    without disturbing the handful of objects that ever get a bespoke unwrap."""
    if obj is None:
        return
    {
        "box": project_box_uvs,
        "planar": project_planar_uvs,
        "cylindrical": project_cylindrical_uvs,
    }[kind](obj)

"""
Render the built model to PNGs so it can actually be looked at.

Headless Blender can render, which means the build loop is not blind: these
images are the feedback. Orthographic profile, plan and body-plan views are the
ones to compare against reference photos and lines drawings; the three-quarter
view is for judging whether it reads as the right boat.

    npm run model:preview   ->   blender/renders/*.png
"""

import os
import sys
from math import atan2, degrees, radians

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402

import params  # noqa: E402


def _y(station):
    """Blender's y for a station, so views can be aimed in the units the boat is
    described in rather than in offsets from amidships."""
    return params.station_to_y(station)


VIEWS = {
    # name: (location, aim, ortho scale or None for perspective,
    #        frame aspect as height/width, [lens in mm], [near clip in m])
    #
    # `aim` is either rotation in degrees or `{"at": point}` to look at.
    #
    # A camera at zero rotation looks down -Z with +Y as its up axis. So the
    # elevations pitch 90 degrees to look level and then yaw to pick a side,
    # while the plan view only yaws. Every view puts the bow on the right, so
    # they can be laid against the brochure drawings without mirroring.
    #
    # Aspect is per view because the rig changed the proportions of the subject
    # entirely: the boat is 7.6 m long but nearly 11.5 m from keel to masthead,
    # so the elevations that used to be letterbox now have to be portrait.
    "profile": ((30, 0, 4.3), (90, 0, 90), 12.6, 1.0),  # starboard, bow right
    "plan": ((0, 0, 30), (0, 0, 90), 9.0, 0.42),  # from above, bow right
    "bow": ((0, 30, 4.3), (90, 0, 180), 5.2, 2.35),
    "stern": ((0, -30, 4.3), (90, 0, 0), 5.2, 2.35),
    "three-quarter": ((11.0, -13.0, 6.4), (80, 0, 40), None, 0.85),
    # Close on the cabin side, where the band and its windows live. Worth a
    # standing view of its own: it is the boat's most recognisable feature and
    # it is invisible in every wider shot.
    "cabinside": ((3.9, -1.8, 1.45), (81.4, 0, 65.6), None, 0.5),
    # Down into the cockpit -- the stop the camera path spends most time at.
    "cockpit": ((2.5, -6.5, 2.8), (62.6, 0, 31.9), None, 0.7),
    # Over the bow quarter onto the forward deck. The two things here read in no
    # other view: the coachroof's sloped sides, which are edge-on in profile and
    # invisible in plan, and the chevron of the deck step, which needs a light
    # raking across it before it shows at all.
    "foredeck": ((2.15, 4.30, 1.95), (76.5, 0, 151.3), None, 0.75),
    # Right forward, onto the anchor box and the fore hatch. `foredeck` above
    # frames the coachroof nose and runs out of picture before the bow, so the
    # two things let into the foredeck appear in no view at all without this
    # one -- which is how the anchor box sat amidships as a rectangle for as
    # long as it did.
    "bowdeck": ((0.95, 5.10, 1.90), {"at": (0.0, 3.10, 0.99)}, None, 0.75, 35),
    # Forward from a seat in the cockpit at the companionway. This is very
    # nearly the `cockpit` camera stop's own view, and the only one that shows
    # the two things that stop the cockpit reading as a moulded tray: the way
    # below actually being a way below, and benches on all four sides of the
    # well rather than two.
    "companionway": (
        (0.0, _y(6.55), 1.05),
        {"at": (0.0, _y(5.16), 0.95)},
        None,
        0.85,
        28,
    ),
    # Over the starboard quarter. Everything added to the after end of the boat
    # is invisible in every view above: the elevations put the tiller edge-on
    # against the backstay, the plan flattens the stern rail into the coaming it
    # caps, and the outboard is behind the transom in all of them.
    "quarter": (
        (2.35, _y(9.00), 1.60),
        {"at": (0.15, _y(7.10), 0.60)},
        None,
        0.75,
        45,
    ),
}


INTERIOR_VIEWS = {
    # The two drawings first. An accommodation is judged in section and plan --
    # that is how every builder's brochure in the world draws one -- and the
    # perspectives below are for whether it feels like somewhere, which is a
    # different question and not the one to answer first.
    #
    # The section is taken from starboard, so it looks at the port side: the
    # galley, the wardrobe, and the settee that has to be long enough to sleep
    # on. Clipping is what makes it a section rather than a view of a wall.
    # The near clip is what cuts these open: an orthographic camera 14 m out on
    # the x axis with `clip_start` 14 is a section on the centreline exactly,
    # reversibly, and without touching a single vertex. The plan cuts at 750 mm
    # above the sole, which is above the settees and below the deckhead --
    # cutting any higher just photographs the ceiling.
    "interior-section": ((14.0, 0.0, 0.35), (90, 0, 90), 8.2, 0.42, 50, 14.0),
    "interior-plan": ((0.0, 0.0, 14.0), (0, 0, 90), 8.2, 0.42, 50, 13.44),
    # The cabin camera stop itself, looking forward down the boat. This is the
    # only one of these the visitor will ever see, and the only one that can
    # say whether the stop is framed on anything.
    "saloon": ((0.0, _y(5.08), 0.82), {"at": (0.0, _y(2.20), 0.35)}, None, 0.72, 24),
    # Across the saloon into the galley, from where someone sitting on the
    # starboard settee would be looking. Aimed at the worktop rather than at
    # the sole under it now that the worktop is the chart table: what is on it
    # is the point of the view, and the old aim put the whole of it in the top
    # quarter of frame.
    "galley": ((0.55, _y(4.05), 0.76), {"at": (-0.80, _y(4.95), 0.50)}, None, 0.8, 24),
    # Close on the chart table, from standing at its inboard edge. The one view
    # that can judge the five objects on it against each other -- whether the
    # lamp clears the deckhead, whether the safe stands where a hand would go,
    # and whether the chart reads as paper. Everything here is between 8 mm and
    # 230 mm, and every other interior camera is too far off to resolve any of
    # it.
    "desk": ((-0.34, _y(4.42), 0.88), {"at": (-0.90, _y(4.94), 0.52)}, None, 0.8, 35),
    # The after starboard book run, from the middle of the saloon: the two
    # placeholder bindings and the three beside them. Books are the smallest
    # thing in the cabin that has to survive being looked at closely -- the
    # case, the page block and the gilt are 2.5, 4 and 0.6 mm apart -- and no
    # wider view can show whether any of that landed.
    "bookshelf": ((0.10, _y(4.08), 0.70), {"at": (1.09, _y(4.73), 0.68)}, None, 0.7, 40),
    # The VHF on the after bulkhead, starboard of the steps. Framed from where
    # someone on the starboard settee turns to look at it, which is also the
    # angle the cabin stop's free-look reaches it from -- and the only angle
    # that shows the handset and its cord standing off the panel rather than
    # flat against it.
    "navstation": ((0.30, _y(4.30), 0.66), {"at": (0.76, _y(5.14), 0.45)}, None, 0.8, 35),
    # Through the doorway between the bulkheads into the forepeak. Off the
    # centreline, because the mast post is on it: framed straight down the boat
    # this view is a photograph of a post 150 mm from the lens.
    "forepeak": ((0.26, _y(4.30), 0.62), {"at": (0.0, _y(1.10), 0.16)}, None, 0.9, 24),
    # The other half of the cabin stop: the same place, turned round. `saloon`
    # looks forward and every other view here looks at a side, so the after end
    # of the accommodation -- the way below, the after face of the cabin, and
    # what is or is not closed off under the cockpit either side of it -- was
    # the one part of the interior no camera pointed at. It is also the part a
    # visitor arriving down the steps sees first.
    "cabin-aft": ((0.0, _y(3.85), 0.95), {"at": (0.0, _y(5.40), 0.25)}, None, 0.8, 24),
    # Straight across the saloon at a window, from the settee opposite. The only
    # view that can answer the question the windows exist to answer -- whether
    # they are openings or paint -- because every other interior camera takes
    # the cabin side at a glancing angle, and a hole seen edge-on is a line.
    # Three things to look for: the opening square behind its pane, daylight
    # through it, and the reveal reading as a thickness rather than an outline.
    "window": ((-0.30, _y(4.60), 0.62), {"at": (1.22, _y(4.66), 0.905)}, None, 0.75, 28),
}


def parse_args(argv: list[str]) -> dict:
    args = argv[argv.index("--") + 1 :] if "--" in argv else []
    out = {
        "project": os.getcwd(),
        "resolution": 1200,
        "turntable": 0,
        "views": "exterior",
    }

    for i, token in enumerate(args):
        if token == "--project" and i + 1 < len(args):
            out["project"] = os.path.abspath(args[i + 1])
        elif token == "--resolution" and i + 1 < len(args):
            out["resolution"] = int(args[i + 1])
        elif token == "--turntable" and i + 1 < len(args):
            out["turntable"] = int(args[i + 1])
        elif token == "--views" and i + 1 < len(args):
            out["views"] = args[i + 1]

    return out


def setup_lighting() -> None:
    """A plain studio setup. Readable, not pretty -- this is a measuring tool."""
    world = bpy.data.worlds.new("preview")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.05, 0.06, 0.08, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 1.0
    bpy.context.scene.world = world

    key = bpy.data.lights.new("key", type="SUN")
    key.energy = 4.0
    key.angle = radians(10)
    key_obj = bpy.data.objects.new("key", key)
    key_obj.rotation_euler = (radians(55), 0, radians(35))
    bpy.context.scene.collection.objects.link(key_obj)

    fill = bpy.data.lights.new("fill", type="SUN")
    fill.energy = 1.2
    fill_obj = bpy.data.objects.new("fill", fill)
    fill_obj.rotation_euler = (radians(70), 0, radians(-120))
    bpy.context.scene.collection.objects.link(fill_obj)


def add_waterline_grid() -> None:
    """A plane at z = 0.

    Freeboard and draft are both measured from the waterline, so having it
    visible in every render makes an eyeball check of those possible without
    reaching for the measuring script.
    """
    mesh = bpy.data.meshes.new("waterline")
    size = 45.0
    mesh.from_pydata(
        [(-size, -size, 0), (size, -size, 0), (size, size, 0), (-size, size, 0)],
        [],
        [(0, 1, 2, 3)],
    )
    obj = bpy.data.objects.new("waterline", mesh)

    material = bpy.data.materials.new("waterline")
    material.use_nodes = True
    bsdf = material.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (0.03, 0.10, 0.14, 1)
    bsdf.inputs["Roughness"].default_value = 0.25
    obj.data.materials.append(material)

    bpy.context.scene.collection.objects.link(obj)


def look_at(location: tuple, target: tuple) -> tuple:
    """Euler angles, in degrees, that aim a camera at `location` towards `target`.

    Every view here used to carry hand-computed angles, which is fine for the
    elevations -- they are all right angles -- and a trap for anything aimed at
    a feature: a degree or two out at ten metres is a different picture, and
    there is no way to tell a mis-aimed camera from a mis-built boat by reading
    the numbers. Say where to point instead and let the trigonometry follow.
    """
    dx, dy, dz = (t - l for t, l in zip(target, location))
    flat = (dx * dx + dy * dy) ** 0.5

    # A camera at zero rotation looks down -Z. Pitch up from there to the
    # horizontal and beyond, then yaw round to face the target.
    pitch = degrees(atan2(flat, -dz))
    yaw = degrees(atan2(-dx, dy))
    return (pitch, 0.0, yaw)


def render_view(name: str, spec: tuple, out_dir: str, resolution: int) -> str:
    location, aim, ortho_scale, aspect = spec[:4]
    lens = spec[4] if len(spec) > 4 else 50
    clip_start = spec[5] if len(spec) > 5 else 0.1
    # `aim` is either euler angles or `{"at": point}`. Angles suit the
    # elevations, which are defined by their direction; a point suits anything
    # framing a feature, which is defined by what is in the middle of it.
    rotation = look_at(location, aim["at"]) if isinstance(aim, dict) else aim

    camera_data = bpy.data.cameras.new(f"cam_{name}")
    if ortho_scale is not None:
        camera_data.type = "ORTHO"
        camera_data.ortho_scale = ortho_scale
    else:
        camera_data.lens = lens

    # The near plane, which is how the section views cut themselves open.
    camera_data.clip_start = clip_start

    camera = bpy.data.objects.new(f"cam_{name}", camera_data)
    camera.location = location
    camera.rotation_euler = tuple(radians(a) for a in rotation)
    bpy.context.scene.collection.objects.link(camera)
    bpy.context.scene.camera = camera

    scene = bpy.context.scene
    scene.render.resolution_x = resolution
    scene.render.resolution_y = int(resolution * aspect)
    scene.render.film_transparent = False

    path = os.path.join(out_dir, f"{name}.png")
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)

    bpy.data.objects.remove(camera, do_unlink=True)
    return path


def render_turntable(frames: int, out_dir: str, resolution: int) -> list[str]:
    """Orbit the boat and render a frame every few degrees.

    Orthographic elevations are the right tool for checking dimensions against a
    drawing, but they are a poor way to judge whether a hull is fair. Sweeping
    the camera round shows up flat spots and unfair runs that no single view
    does, and the frames flip into a turntable you can drag.

    JPEG, not PNG -- a full orbit is a lot of frames, and these get embedded.
    """
    from math import cos, radians, sin

    scene = bpy.context.scene
    scene.render.image_settings.file_format = "JPEG"
    scene.render.image_settings.quality = 82

    radius, height = 18.0, 6.0
    paths = []

    for i in range(frames):
        angle = radians(360 * i / frames)

        camera_data = bpy.data.cameras.new(f"turn_{i}")
        camera_data.lens = 42
        camera = bpy.data.objects.new(f"turn_{i}", camera_data)
        camera.location = (radius * sin(angle), -radius * cos(angle), height)
        # Point at the boat: pitch down towards it, then yaw round the orbit.
        camera.rotation_euler = (radians(83.3), 0, angle)
        bpy.context.scene.collection.objects.link(camera)
        scene.camera = camera

        scene.render.resolution_x = resolution
        scene.render.resolution_y = int(resolution * 0.85)
        path = os.path.join(out_dir, f"turn_{i:02d}.jpg")
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)

        bpy.data.objects.remove(camera, do_unlink=True)
        paths.append(path)

    return paths


def main() -> int:
    opts = parse_args(sys.argv)
    project = opts["project"]

    # One model, so `--views` picks a set of cameras rather than a file. The
    # interior set needs the deck taken off and some light put under it, which
    # is a change to the scene, so the two sets are rendered in separate runs.
    interior = opts["views"] == "interior"
    blend_path = os.path.join(project, "blender", "maxi77.blend")
    if not os.path.exists(blend_path):
        print(f"[preview] no build found at {blend_path} -- run model:build first")
        return 1

    bpy.ops.wm.open_mainfile(filepath=blend_path)

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.image_settings.file_format = "PNG"

    setup_lighting()
    if not interior:
        add_waterline_grid()

    out_dir = os.path.join(project, "blender", "renders")
    os.makedirs(out_dir, exist_ok=True)

    if opts["turntable"]:
        frames = render_turntable(opts["turntable"], out_dir, opts["resolution"])
        print(f"[preview] wrote {len(frames)} turntable frames to {out_dir}")
        return 0

    views = INTERIOR_VIEWS if interior else VIEWS
    if interior:
        _open_up(scene)

    for name, spec in views.items():
        path = render_view(name, spec, out_dir, opts["resolution"])
        print(f"[preview] wrote {path}")

    print(f"[preview] LOA target {params.LOA} m, beam target {params.BEAM_AT_STATION} m")
    return 0


HIDE_FOR_INTERIOR = (
    "deck_forward",
    "deck_aft",
    "mast",
    "boom",
    "sailcover",
    "rigging",
    # Deck fittings, which all sit within about 20 mm of the deckhead and
    # z-fight with it from underneath.
    "anchorbox",
    "forehatch",
    "forehatch_pane",
    "cockpit_lids",
    # The deck fittings, for the same reason and one more: the plan view cuts at
    # 750 mm above the sole, which is through the middle of the stanchions and
    # the pulpit, so left in they photograph as a ring of little circles round
    # an accommodation drawing.
    "pulpit",
    "stanchions",
    "lifelines",
    "stern_rail",
    "winches",
    "traveller",
    "cockpit_grating",
    "tiller",
    "outboard",
    "pulpit_block",
    # The sails, which from underneath are a ceiling over the whole boat.
    "mainsail",
    "genoa",
    "sail_number",
)
"""Reference geometry that is only ever between the camera and the cabin.

The hull stays, and so do the windows. They are what make these renders
legible: with the hull there you can see whether a settee actually reaches the
topsides, and without it the furniture floats in space and every one of these
views looks fine. The windows are the cabin's own, and are as much a part of
the interior as of the outside.
"""


def _open_up(scene) -> None:
    """Take the lid off, and put some light under it.

    Nothing is cut. The section and plan views clip themselves with the camera's
    own near plane, which is exact, reversible and costs no geometry -- an
    orthographic camera at x = +14 with `clip_start` 14 is a section on the
    centreline and nothing else needs to know about it.
    """
    for name in HIDE_FOR_INTERIOR:
        obj = bpy.data.objects.get(name)
        if obj is not None:
            obj.hide_render = True

    # A cabin lit only by the sun outside it renders black, which says nothing
    # about the cabin. Three lamps, roughly where the brochure puts them:
    # "Tre lampor i taket, varav en i forpiken".
    scene.world.node_tree.nodes["Background"].inputs[1].default_value = 2.5

    # And more samples than the exterior needs. Three soft-shadowed point lamps
    # in a small room is the noisiest thing this file asks EEVEE to do, and at
    # the default 64 the shadow terminator across the quarter berth comes out as
    # a band of speckle -- which looks exactly like a modelling fault, and cost
    # an afternoon of hunting for one before it was recognised as sampling noise.
    scene.eevee.taa_render_samples = 256

    for station, energy in ((1.60, 12.0), (3.60, 18.0), (4.90, 18.0)):
        lamp = bpy.data.lights.new(f"cabin_{station:.1f}", type="POINT")
        lamp.energy = energy
        lamp.shadow_soft_size = 0.12
        obj = bpy.data.objects.new(f"cabin_{station:.1f}", lamp)
        obj.location = (0.0, params.station_to_y(station), 0.72)
        scene.collection.objects.link(obj)


if __name__ == "__main__":
    sys.exit(main())

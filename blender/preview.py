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
from math import radians

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402

import params  # noqa: E402


VIEWS = {
    # name: (location, rotation in degrees, ortho scale or None for perspective,
    #        frame aspect as height/width)
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
}


def parse_args(argv: list[str]) -> dict:
    args = argv[argv.index("--") + 1 :] if "--" in argv else []
    out = {"project": os.getcwd(), "resolution": 1200, "turntable": 0}

    for i, token in enumerate(args):
        if token == "--project" and i + 1 < len(args):
            out["project"] = os.path.abspath(args[i + 1])
        elif token == "--resolution" and i + 1 < len(args):
            out["resolution"] = int(args[i + 1])
        elif token == "--turntable" and i + 1 < len(args):
            out["turntable"] = int(args[i + 1])

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


def render_view(name: str, spec: tuple, out_dir: str, resolution: int) -> str:
    location, rotation, ortho_scale, aspect = spec

    camera_data = bpy.data.cameras.new(f"cam_{name}")
    if ortho_scale is not None:
        camera_data.type = "ORTHO"
        camera_data.ortho_scale = ortho_scale
    else:
        camera_data.lens = 50

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

    blend_path = os.path.join(project, "blender", "maxi77_exterior.blend")
    if not os.path.exists(blend_path):
        print(f"[preview] no build found at {blend_path} -- run model:build first")
        return 1

    bpy.ops.wm.open_mainfile(filepath=blend_path)

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.image_settings.file_format = "PNG"

    setup_lighting()
    add_waterline_grid()

    out_dir = os.path.join(project, "blender", "renders")
    os.makedirs(out_dir, exist_ok=True)

    if opts["turntable"]:
        frames = render_turntable(opts["turntable"], out_dir, opts["resolution"])
        print(f"[preview] wrote {len(frames)} turntable frames to {out_dir}")
        return 0

    for name, spec in VIEWS.items():
        path = render_view(name, spec, out_dir, opts["resolution"])
        print(f"[preview] wrote {path}")

    print(f"[preview] LOA target {params.LOA} m, beam target {params.BEAM_AT_STATION} m")
    return 0


if __name__ == "__main__":
    sys.exit(main())

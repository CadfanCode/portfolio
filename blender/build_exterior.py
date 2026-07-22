"""
Build the Maxi 77 exterior and export it for the web app.

Run headless:

    npm run model:build

or directly (paths must be absolute -- the Flatpak's working directory is not
the project):

    flatpak run org.blender.Blender -b --factory-startup \\
        --python "$PWD/blender/build_exterior.py" -- --project "$PWD"

The .blend it writes is a build artifact. It is regenerated from nothing every
run, so anything hand-edited in it is lost on the next build; changes worth
keeping belong in `params.py`.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402  (must follow the path setup)

import deck  # noqa: E402
import hull  # noqa: E402
import keel_rudder  # noqa: E402
import materials  # noqa: E402
import params  # noqa: E402
import rig  # noqa: E402
from lib.mesh import reset_scene  # noqa: E402


def parse_args(argv: list[str]) -> dict:
    """Read the arguments Blender passes through after `--`."""
    args = argv[argv.index("--") + 1 :] if "--" in argv else []
    out = {"project": os.getcwd()}

    for i, token in enumerate(args):
        if token == "--project" and i + 1 < len(args):
            out["project"] = os.path.abspath(args[i + 1])

    return out


def main() -> int:
    opts = parse_args(sys.argv)
    project = opts["project"]

    blend_path = os.path.join(project, "blender", "maxi77_exterior.blend")
    glb_path = os.path.join(project, "src", "assets", "models", "maxi77-exterior.glb")

    print(f"[build] project   {project}")
    print(f"[build] modelling Maxi 77, {params.MODEL_YEAR} deck")

    collection = reset_scene()

    built = {}
    built["hull"], built["rubrail"] = hull.build(collection)
    built["keel"], built["skeg"], built["rudder"] = keel_rudder.build(collection)
    (
        built["deck_fwd"],
        built["deck_aft"],
        built["companion"],
        built["sailbox"],
        built["windows"],
    ) = deck.build(collection)

    # The rig has to follow the deck, not a second guess at where it is.
    built.update(rig.build(collection, deck.height_function()))

    materials.apply(built, deck.band_surface_function())

    total = 0
    for name, obj in built.items():
        if obj is None:
            continue
        faces = len(obj.data.polygons)
        total += faces
        print(f"[build] {name:<9} {faces} faces")
    print(f"[build] total     {total} faces")

    os.makedirs(os.path.dirname(glb_path), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=blend_path)
    print(f"[build] wrote     {blend_path}")

    bpy.ops.export_scene.gltf(
        filepath=glb_path,
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_cameras=False,
        export_lights=False,
        use_visible=True,
    )
    size_kb = os.path.getsize(glb_path) / 1024
    print(f"[build] wrote     {glb_path} ({size_kb:.0f} KB)")

    return 0


if __name__ == "__main__":
    sys.exit(main())

"""
Build the Maxi 77 -- hull, deck, rig and accommodation -- and export it for the
web app. Also builds a second, unrelated model behind the same entry point:
the Stockholm-archipelago prop kit (`archipelago.py`), selected with
`--target archipelago`.

Run headless:

    npm run model:build
    npm run model:build -- --target archipelago

or directly (paths must be absolute -- the Flatpak's working directory is not
the project):

    flatpak run org.blender.Blender -b --factory-startup \\
        --python "$PWD/blender/build.py" -- --project "$PWD"
    flatpak run org.blender.Blender -b --factory-startup \\
        --python "$PWD/blender/build.py" -- --project "$PWD" --target archipelago

`--target boat` is the default and its behaviour is untouched by the
archipelago target existing: the two builds share nothing but this file's
argument parsing and the flatpak/absolute-path plumbing in `main()`.

One model, one GLB. The interior was briefly built and shipped separately, on
the theory that the ocean stop should not wait for cabin geometry -- and the
cabin turned out to be 32 KB over the wire against the exterior's 226, so the
saving was 12% of the first load in exchange for two assets that could be
committed at different times and drift apart.

It also could not have survived the camera path. `SCENE_LINKS` routes cockpit ->
cabin and `CameraRig` interpolates between stops, so the camera passes bodily
through the companionway; both halves have to be present at once for that to be
anything but a hole. If load time ever does bite, the lever is mesh compression
on this one file, not splitting it into two.

The .blend it writes is a build artifact. It is regenerated from nothing every
run, so anything hand-edited in it is lost on the next build; changes worth
keeping belong in `params.py`.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402  (must follow the path setup)

import archipelago  # noqa: E402
import deck  # noqa: E402
import fitout  # noqa: E402
import fittings  # noqa: E402
import hull  # noqa: E402
import interior  # noqa: E402
import joinery  # noqa: E402
import keel_rudder  # noqa: E402
import materials  # noqa: E402
import params  # noqa: E402
import rig  # noqa: E402
import sails  # noqa: E402
from lib.mesh import reset_scene  # noqa: E402


def parse_args(argv: list[str]) -> dict:
    """Read the arguments Blender passes through after `--`."""
    args = argv[argv.index("--") + 1 :] if "--" in argv else []
    out = {"project": os.getcwd(), "target": "boat"}

    for i, token in enumerate(args):
        if token == "--project" and i + 1 < len(args):
            out["project"] = os.path.abspath(args[i + 1])
        elif token == "--target" and i + 1 < len(args):
            out["target"] = args[i + 1]

    return out


def main() -> int:
    opts = parse_args(sys.argv)
    if opts["target"] == "archipelago":
        return build_archipelago(opts["project"])
    return build_boat(opts["project"])


def build_archipelago(project: str) -> int:
    """Build the Stockholm-archipelago prop kit and export it on its own.

    A second, independent model built by the same pipeline -- see
    `archipelago.py`. It shares nothing with the boat build below but the
    scene reset and the flatpak/absolute-path plumbing.
    """
    blend_path = os.path.join(project, "blender", "archipelago-kit.blend")
    glb_path = os.path.join(project, "src", "assets", "models", "archipelago-kit.glb")

    print(f"[build] project   {project}")
    print("[build] modelling the archipelago prop kit")

    collection = reset_scene()
    built = archipelago.build(collection)

    for obj in built.values():
        if obj is None:
            continue
        obj.modifiers.new("Triangulate", "TRIANGULATE")

    total = 0
    for name, obj in built.items():
        if obj is None:
            continue
        faces = len(obj.data.polygons)
        total += faces
        print(f"[build] {name:<17} {faces} faces")
    print(f"[build] {'total':<17} {total} faces")

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
        # No normal maps anywhere in this kit (`archipelago.py`), so unlike
        # the boat there is no tangent basis to preserve here.
        export_tangents=False,
    )
    size_kb = os.path.getsize(glb_path) / 1024
    print(f"[build] wrote     {glb_path} ({size_kb:.1f} KB)")

    return 0


def build_boat(project: str) -> int:
    blend_path = os.path.join(project, "blender", "maxi77.blend")
    glb_path = os.path.join(project, "src", "assets", "models", "maxi77.glb")

    print(f"[build] project   {project}")
    print(f"[build] modelling Maxi 77, {params.MODEL_YEAR}")

    collection = reset_scene()

    built = {}
    built["hull"], built["rubrail"] = hull.build(collection)
    built["keel"], built["skeg"], built["rudder"] = keel_rudder.build(collection)
    built.update(deck.build(collection))

    # The rig and the deck fittings both have to follow the deck, not a second
    # guess at where it is.
    built.update(rig.build(collection, deck.height_function()))
    built.update(sails.build(collection))
    built.update(fittings.build(collection))

    built.update(interior.build(collection))
    built.update(joinery.build(collection))
    built.update(fitout.build(collection))

    materials.apply(built, deck.band_surface_function())

    # Triangulate before export so tangents can be calculated. glTF only stores
    # triangles, so the exporter triangulates anyway -- but it computes the
    # tangent basis (mikktspace) from the mesh it is handed *first*, and that
    # calculation silently fails on any quad or n-gon ("Could not calculate
    # tangents. Please try to triangulate the mesh first"). A Triangulate
    # modifier, applied at export by `export_apply`, hands mikktspace a mesh it
    # can actually solve, so every normal-mapped surface gets real tangents
    # instead of the screen-space-derivative fallback. It preserves material
    # indices, UVs and the sharp/smooth edge flags `shade_smooth` set.
    for obj in built.values():
        if obj is None:
            continue
        obj.modifiers.new("Triangulate", "TRIANGULATE")

    total = 0
    for name, obj in built.items():
        if obj is None:
            continue
        faces = len(obj.data.polygons)
        total += faces
        print(f"[build] {name:<17} {faces} faces")
    print(f"[build] {'total':<17} {total} faces")

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
        # Write per-vertex tangents. Every textured material here carries a
        # normal map, and without a tangent attribute three.js falls back to
        # deriving a tangent basis per-fragment from screen-space derivatives --
        # cheaper, but it wobbles the direction a bump tips the light, worst on
        # exactly the low-poly curved surfaces this boat is made of. Exported
        # tangents cost a vec4 per vertex and fix the normal maps to the mesh.
        export_tangents=True,
    )
    size_kb = os.path.getsize(glb_path) / 1024
    print(f"[build] wrote     {glb_path} ({size_kb:.0f} KB)")

    return 0


if __name__ == "__main__":
    sys.exit(main())

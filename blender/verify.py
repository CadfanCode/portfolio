"""
Measure the built model the way a class measurer would.

The Maxi 77 class rules give dimensions with tolerances, taken by a licensed
measurer to decide whether a hull is legal. That makes them usable as a test
suite: this script measures the geometry we generated and checks it against the
same numbers, so "accurate" is a green/red result rather than an opinion.

    npm run model:verify        exit 0 if every check is inside tolerance

It will not catch a boat that is dimensionally correct but looks wrong. That is
what the renders are for.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402

import params  # noqa: E402
from lib.curves import Curve  # noqa: E402


class Check:
    """One measurement against one rule.

    Values are held in the check's own unit; `scale` only affects how they are
    printed. Lengths read in millimetres because that is how the class rules
    state them, which makes the report directly comparable to the document.
    """

    def __init__(self, name, measured, target, tolerance, rule, note="", unit="mm"):
        self.name = name
        self.measured = measured
        self.target = target
        self.tolerance = tolerance
        self.rule = rule
        self.note = note
        self.unit = unit
        self.scale = 1000.0 if unit == "mm" else 1.0

    @property
    def passed(self) -> bool:
        if self.measured is None:
            return False
        return abs(self.measured - self.target) <= self.tolerance


def world_verts(objects):
    """Every vertex of every given object, in world space."""
    points = []
    for obj in objects:
        matrix = obj.matrix_world
        points.extend(matrix @ v.co for v in obj.data.vertices)
    return points


def measure(points, draft_points):
    """Run every measurement we can take off the point cloud.

    `points` is the hull envelope -- skin and rubrail, nothing else. That is
    precisely what D.3.2 measures: "Skrovets langd exklusive roder och inklusive
    avbararlist". Feeding the appendages in here reads the rudder as 510 mm of
    extra boat and the keel as a beam measurement of 38 mm.

    `draft_points` adds the keel, since draft is measured to the lowest point.
    """
    checks = []

    ys = [p.y for p in points]
    zs = [p.z for p in draft_points]

    # Hull length, excluding rudder, including rubrail. D.3.2.
    length = max(ys) - min(ys)
    checks.append(
        Check("hull length (incl. rubrail)", length, params.LOA, 0.020, "D.3.2")
    )

    # Beam at the class measurement station. D.3.2.
    beam = beam_at_station(points, params.BEAM_STATION)
    checks.append(
        Check(
            f"beam at station {params.BEAM_STATION:.3f} m",
            beam,
            params.BEAM_AT_STATION,
            0.020,
            "D.3.2",
        )
    )

    # Draft: waterline to the lowest point. C.5.1.
    # Reported against the canoe body until the keel exists.
    depth = -min(zs)
    checks.append(
        Check("draft (lowest point below waterline)", depth, params.DRAFT, 0.025, "C.5.1")
    )

    # Freeboard at the stem. C.2.2.
    bow_y = max(ys)
    bow_z = max(p.z for p in points if p.y > bow_y - 0.02)
    checks.append(
        Check("freeboard at stem", bow_z, params.FREEBOARD_BOW, 0.010, "C.2.2")
    )

    # Freeboard at the transom corners, averaged. C.2.3.
    stern_y = min(ys)
    stern_z = max(p.z for p in points if p.y < stern_y + 0.02)
    checks.append(
        Check("freeboard at transom", stern_z, params.FREEBOARD_STERN, 0.010, "C.2.3")
    )

    return checks


def hydrostatic_checks(hull_obj, immersed):
    """Waterline length and displacement -- the checks that test the sections.

    Waterline length comes from the hull alone; displacement counts everything
    in the water, appendages included, because that is what displacement means.
    """
    lwl, _ = measure_hydrostatics(hull_obj)

    volume = 0.0
    for obj in immersed:
        _, part = measure_hydrostatics(obj)
        volume += part or 0.0

    target_volume = params.DISPLACEMENT / params.SEAWATER_DENSITY
    displaced_mass = volume * params.SEAWATER_DENSITY if volume else None

    return [
        Check("waterline length", lwl, params.LWL, 0.050, "published"),
        Check(
            "displacement at DWL",
            displaced_mass,
            params.DISPLACEMENT,
            120.0,
            "C.3.1",
            unit="kg",
            note=f"submerged volume {volume:.3f} m3, target {target_volume:.3f} m3"
            if volume
            else "",
        ),
    ]


def beam_at_station(points, station: float):
    """Beam at a station, interpolated between the two nearest sections.

    Taking a thin slice and reading its widest point only works if a section
    happens to land on the station -- which it stopped doing the moment the
    station spacing changed. Interpolating between the bracketing sections is
    both robust to that and closer to what a measurer with a tape would get.
    """
    widest = {}
    for p in points:
        key = round(p.y, 4)
        widest[key] = max(widest.get(key, 0.0), abs(p.x))

    ys = sorted(widest)
    target = params.station_to_y(station)

    if not ys or target < ys[0] or target > ys[-1]:
        return None

    for below, above in zip(ys, ys[1:]):
        if below <= target <= above:
            span = above - below
            t = (target - below) / span if span else 0.0
            return 2 * (widest[below] * (1 - t) + widest[above] * t)

    return None


def measure_hydrostatics(hull_obj):
    """Waterline length and displaced volume, taken off the actual mesh.

    These two are worth more than any other check here. Length, beam and
    freeboard only constrain the outline -- a hull can hit all of them and
    still have sections that are far too full or too fine. Displacement is the
    integral of the section shapes, so if the boat floats at the right depth
    with the right volume, the sections are broadly right.

    Done by clipping the hull at z = 0, capping the hole with the waterplane,
    and taking the volume of the resulting closed solid.
    """
    import bmesh

    bm = bmesh.new()
    bm.from_mesh(hull_obj.data)
    bm.transform(hull_obj.matrix_world)

    # Everything at or below the waterline.
    bmesh.ops.bisect_plane(
        bm,
        geom=list(bm.verts) + list(bm.edges) + list(bm.faces),
        plane_co=(0.0, 0.0, 0.0),
        plane_no=(0.0, 0.0, 1.0),
        clear_outer=True,
    )

    submerged = [v.co.copy() for v in bm.verts]
    if not submerged:
        bm.free()
        return None, None

    lwl = max(v.y for v in submerged) - min(v.y for v in submerged)

    # Cap the open top with the waterplane so the solid closes and the volume
    # integral means something.
    boundary = [e for e in bm.edges if len(e.link_faces) == 1]
    if boundary:
        bmesh.ops.holes_fill(bm, edges=boundary)

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    volume = abs(bm.calc_volume(signed=True))
    bm.free()

    return lwl, volume


def report(checks) -> bool:
    width = max(len(c.name) for c in checks)
    print()
    print(f"  {'measurement'.ljust(width)}   measured    target       tol  unit  rule")
    print(f"  {'-' * width}   --------  --------  --------  ----  ------")

    for c in checks:
        s = c.scale
        measured = f"{c.measured * s:8.1f}" if c.measured is not None else "       -"
        print(
            f"  {c.name.ljust(width)}   {measured}  {c.target * s:8.1f}  "
            f"+/-{c.tolerance * s:5.1f}  {c.unit:>4}  {c.rule}"
            f"   {'PASS' if c.passed else 'FAIL'}"
        )
        if c.note:
            print(f"  {' ' * width}   ({c.note})")

    failed = [c for c in checks if not c.passed]
    print()
    print(f"  {len(checks) - len(failed)}/{len(checks)} inside tolerance")
    print()
    return not failed


def keel_check(keel_obj):
    """Weigh the keel casting in cast iron and compare to rule E.2.2.

    Worth more than it looks. Nothing else constrains the bulb: draft only fixes
    how deep the keel goes, and the profile drawing shows the bulb ambiguously
    enough to be read as a flat annotation. Weight is what says how much iron has
    to be down there, and a fin without a bulb comes out light.
    """
    import bmesh

    if keel_obj is None:
        return []

    bm = bmesh.new()
    bm.from_mesh(keel_obj.data)
    bm.transform(keel_obj.matrix_world)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    volume = abs(bm.calc_volume(signed=True))
    bm.free()

    return [
        Check(
            "keel weight (cast iron)",
            volume * params.CAST_IRON_DENSITY,
            params.KEEL_WEIGHT,
            25.0,
            "E.2.2",
            unit="kg",
            note=f"casting volume {volume:.4f} m3",
        )
    ]


def rig_checks(by_name):
    """Measure the rig the way rules C.6.1 and F.2 do.

    The class rules dimension a rig far more tightly than a hull, because it is
    what a one-design fleet argues about, so most of the rig is checkable rather
    than fitted. These read off the built spars, not off the parameters that
    made them -- otherwise they would only prove arithmetic.
    """
    checks = []
    sheer = Curve(params.SHEER)

    mast = by_name.get("mast")
    if mast is None:
        return checks

    mast_points = world_verts([mast])
    front_station = params.y_to_station(max(p.y for p in mast_points))
    aft_station = params.y_to_station(min(p.y for p in mast_points))
    masthead = max(p.z for p in mast_points)

    checks.append(
        Check(
            "stem to mast front face",
            front_station,
            params.MAST_STATION,
            0.020,
            "F.2.2",
        )
    )
    checks.append(
        Check(
            "masthead above sheer",
            masthead - sheer((front_station + aft_station) / 2),
            params.MASTHEAD_ABOVE_SHEER,
            0.050,
            "published I",
        )
    )

    boom = by_name.get("boom")
    if boom is not None:
        outer = params.y_to_station(min(p.y for p in world_verts([boom])))
        checks.append(
            Check("boom band from mast aft face", outer - aft_station,
                  params.BOOM_LENGTH, 0.025, "C.6.1 max")
        )

    spreaders = by_name.get("spreaders")
    if spreaders is not None:
        tip = max(abs(p.x) for p in world_verts([spreaders]))
        checks.append(
            Check("spreader length", tip - params.MAST_SECTION[0] / 2,
                  params.SPREADER_LENGTH, 0.025, "F.2.2 min")
        )

    return checks


def parse_args(argv: list[str]) -> dict:
    args = argv[argv.index("--") + 1 :] if "--" in argv else []
    out = {"project": os.getcwd()}
    for i, token in enumerate(args):
        if token == "--project" and i + 1 < len(args):
            out["project"] = os.path.abspath(args[i + 1])
    return out


def main() -> int:
    opts = parse_args(sys.argv)
    blend_path = os.path.join(opts["project"], "blender", "maxi77_exterior.blend")

    if not os.path.exists(blend_path):
        print(f"[verify] no build found at {blend_path} -- run model:build first")
        return 1

    bpy.ops.wm.open_mainfile(filepath=blend_path)

    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    if not meshes:
        print("[verify] the build contains no mesh objects")
        return 1

    print(f"[verify] measuring {len(meshes)} object(s): "
          f"{', '.join(sorted(o.name for o in meshes))}")

    by_name = {o.name: o for o in meshes}

    def group(*names):
        return [by_name[n] for n in names if n in by_name]

    envelope = group("hull", "rubrail")
    if not envelope:
        print("[verify] no hull found -- nothing to measure")
        return 1

    checks = measure(
        world_verts(envelope),
        world_verts(group("hull", "rubrail", "keel", "skeg")),
    )

    # Hydrostatics need the hull skin on its own -- the rubrail is a separate
    # shell and would leave the solid open.
    checks += hydrostatic_checks(
        by_name["hull"], group("hull", "keel", "skeg", "rudder")
    )
    checks += keel_check(by_name.get("keel"))
    checks += rig_checks(by_name)

    return 0 if report(checks) else 1


if __name__ == "__main__":
    sys.exit(main())

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


def fittings_checks(by_name):
    """Measure the deck fittings.

    Nothing here comes from the class rules or the brochure. These are the
    dimensions the fittings were *asked* for -- a foot of stern rail, two feet
    between the winches, a foot and a half of stanchion -- read back off the
    built meshes, plus three checks that are not dimensions at all and are the
    reason this section exists.

    Those three are agreements between parts that are built by different code
    from different numbers, and every one of them can be wrong while every part
    involved is individually correct:

        The after locker lid is supposed to be the width of the footwell. Two
        modules, two station ranges, one number that has to match.

        The winches have to stand on side deck. The strip they are on is 89 mm
        wide at the after pair, and a winch is 80 mm.

        The tiller has to miss the stern rail. They are the only two things on
        this boat that occupy the same place at different heights, and which of
        them is on top has already changed once -- the rail used to lie on the
        coaming with the tiller passing 20 mm over it, and now stands 300 mm up
        with the tiller passing under.
    """
    import fittings

    checks = []
    if "stern_rail" not in by_name:
        print("[verify] no deck fittings found in the build")
        return checks

    rail = world_verts([by_name["stern_rail"]])
    stations = [params.y_to_station(p.y) for p in rail]
    checks.append(
        Check(
            "stern rail return",
            max(stations) - min(stations) - params.STERN_RAIL_RADIUS * 2,
            params.STERN_RAIL_RETURN,
            0.030,
            "fitted",
            note="one foot forward of the after corner, each side",
        )
    )

    # --- The after lid against the footwell it is supposed to line up with.
    lids = by_name.get("cockpit_lids")
    if lids is not None:
        aft = [
            p
            for p in world_verts([lids])
            if params.y_to_station(p.y) > params.COCKPIT_FOOTWELL_END
        ]
        checks.append(
            Check(
                "after lid against footwell width",
                2 * max(abs(p.x) for p in aft) if aft else None,
                2 * (deck_widths()[0] - params.COCKPIT_LID_SEAM),
                0.010,
                "fitted",
                note="the lid's sides carry on from the sides of the well",
            )
        )

    # --- Winch spacing, and whether they are standing on anything.
    stations = params.COCKPIT_WINCH_STATIONS
    checks.append(
        Check(
            "winch spacing",
            stations[1] - stations[0],
            0.610,
            0.020,
            "fitted",
            note="two feet apart",
        )
    )

    import deck as deck_module

    worst = min(
        deck_module.deck_edge_half_width(s)
        - fittings.winch_centre(s)
        - params.COCKPIT_WINCH_BASE
        for s in stations
    )
    checks.append(
        Check(
            "winch base inboard of the deck edge",
            worst,
            0.008,
            0.008,
            "clearance",
            note="the side deck is 89 mm wide at the after pair",
        )
    )

    # --- Guardrails: the height a lifeline has to be at to be one.
    posts = by_name.get("stanchions")
    if posts is not None:
        heights = world_verts([posts])
        surface = deck_module.surface_function()
        station = fittings.stanchion_stations()[-1]
        top = max(
            p.z
            for p in heights
            if abs(params.y_to_station(p.y) - station) < 0.05
        )
        foot = surface(station, deck_module.deck_edge_half_width(station))
        checks.append(
            Check(
                "stanchion above the deck",
                top - foot,
                params.STANCHION_HEIGHT,
                0.015,
                "fitted",
                note="1.5 ft, which is a person and not a boat",
            )
        )

    # --- The flooring, against the two dimensions it is described by.
    planks = fittings.cockpit_grating_planks()
    checks.append(
        Check(
            "cockpit grating plank",
            planks[0][1] - planks[0][0],
            params.COCKPIT_GRATING_PLANK,
            0.001,
            "fitted",
            note=f"{len(planks)} planks laid from a seam on the centreline",
        )
    )
    checks.append(
        Check(
            "cockpit grating gap",
            planks[1][0] - planks[0][1],
            params.COCKPIT_GRATING_GAP,
            0.001,
            "fitted",
        )
    )

    # --- The tiller passing under the rail it used to pass over.
    tiller = by_name.get("tiller")
    if tiller is not None:
        gap = _tiller_clearance(world_verts([tiller]), rail)
        checks.append(
            Check(
                "tiller under the stern rail",
                -gap if gap is not None else None,
                0.190,
                0.090,
                "clearance",
                note="a tiller through the rail is a tiller that cannot move",
            )
        )

    # --- The outboard, which is only useful if it reaches the water.
    outboard = by_name.get("outboard")
    if outboard is not None:
        points = world_verts([outboard])
        # The top of the disc, not the bottom of it. A propeller with its
        # upper blade in the air is a propeller that ventilates, and measuring
        # the deepest point cannot tell the difference: the foot went 70 mm
        # further down than it needed to and still passed.
        checks.append(
            Check(
                "whole propeller below the waterline",
                -(min(p.z for p in points) + params.OUTBOARD_PROP_DIAMETER),
                0.090,
                0.055,
                "clearance",
                note="the disc is 190 mm across and all of it has to be wet",
            )
        )
        checks.append(
            Check(
                "outboard clear of the rudder",
                min(abs(p.x) for p in points) - params.RUDDER_THICKNESS / 2,
                0.245,
                0.060,
                "clearance",
                note="offset to starboard because the rudder is on the centreline",
            )
        )

    return checks


def deck_widths():
    """The cockpit's half-widths where the footwell ends, which is the one place
    the after locker lid and the well have to agree."""
    import deck as deck_module

    return deck_module.cockpit_widths(params.COCKPIT_FOOTWELL_END)


def _tiller_clearance(tiller, rail):
    """Smallest signed vertical gap, tiller minus rail, wherever the two are over
    each other. Negative now that the rail is a pushpit and the tiller goes
    under it.

    Measured as a point cloud rather than analytically, because it is the built
    geometry that has to miss and both of these are swept tubes whose surfaces
    are a good deal fatter than the paths they were built from.
    """
    worst = None
    for point in tiller:
        for other in rail:
            if abs(point.x - other.x) > 0.05:
                continue
            if abs(point.y - other.y) > 0.05:
                continue
            gap = point.z - other.z
            worst = gap if worst is None else min(worst, gap)
    return worst


def interior_checks(by_name):
    """Measure the accommodation.

    Nothing here comes from the class rules -- they stop at the deck. These are
    the brochure's own claims about the boat turned into measurements, plus one
    check that is not a claim at all and matters more than the rest.

    That one is clearance. Length, headroom and berth sizes all describe the
    interior on its own terms, and an interior can satisfy every one of them
    while standing 40 mm outside its own topsides: the liner is generated from
    a copy of the hull curves and the joinery is cut to fitted numbers, so
    nothing in the process forces them to agree. It is the same argument the
    hydrostatics make about the hull -- outline checks constrain an outline,
    and you need one measurement of the solid to know it is really there.
    """
    from lib.curves import Curve

    checks = []
    interior_objs = [
        by_name[n]
        for n in (
            "liner",
            "bulkheads",
            "galley",
            "quarter_berth",
            "steps",
            "table",
            # The fit-out, which is cut to the hull by the same call the joinery
            # uses and can go wrong in exactly the same way. The settee cushions
            # did, first time: cut to the topsides at their top edge and standing
            # 33 mm outside them at their bottom one, which shows from the water
            # as a stripe down the hull and from nowhere at all inside the cabin.
            "cushions",
            "backrests",
            "shelf",
            "locker_doors",
            "galley_fittings",
        )
        if n in by_name
    ]
    if not interior_objs:
        print("[verify] no interior found in the build")
        return checks

    sheer = Curve(params.SHEER)
    profile = Curve(params.PROFILE)
    half_beam = Curve(params.HALF_BEAM)
    fullness = Curve(params.SECTION_FULLNESS)
    tuck = Curve(params.SECTION_TUCK)

    from lib.curves import section_half_beam

    # --- Clearance: nothing may be outside the hull skin.
    worst, worst_at = 0.0, None
    for point in world_verts(interior_objs):
        station = params.y_to_station(point.y)
        if not 0.0 <= station <= params.LOA:
            continue
        skin = section_half_beam(
            max(0.0, half_beam(station) - params.RUBRAIL_PROUD),
            sheer(station),
            profile(station),
            fullness(station),
            tuck(station),
            point.z,
        )
        over = abs(point.x) - skin
        if over > worst:
            worst, worst_at = over, station

    note = f"worst at station {worst_at:.3f} m" if worst_at is not None else ""
    checks.append(
        Check(
            "interior inside the hull skin",
            worst,
            0.0,
            0.002,
            "clearance",
            note=note,
        )
    )

    # --- Headroom, both ways round. The brochure sells standing headroom at the
    # galley as the best thing about the boat, which only means anything if
    # there is not standing headroom everywhere -- so both are checked.
    deckhead = by_name.get("deckhead")
    if deckhead is not None:
        def headroom(station):
            """Deckhead above the sole on the centreline, at a station."""
            best = None
            for point in world_verts([deckhead]):
                if abs(point.x) > 0.09:
                    continue
                if abs(params.y_to_station(point.y) - station) > 0.12:
                    continue
                best = point.z if best is None else max(best, point.z)
            return None if best is None else best - params.SOLE_LEVEL

        # Where someone at the galley actually stands, which is not the middle
        # of the galley. The worktop runs aft past the bulkhead and under the
        # side deck -- that is how 720 mm of it fits in a 1900 mm saloon -- so
        # its own midpoint is not under the cabin at all. Now that the bulkhead
        # leans forward over the top of it there is no deckhead there to
        # measure, and asking for one returns nothing rather than something
        # wrong, which is how this surfaced.
        galley = headroom(
            min(
                (params.GALLEY_START + params.GALLEY_END) / 2,
                params.COACHROOF_END - 0.250,
            )
        )
        saloon = headroom((params.SETTEE_START + params.SETTEE_END) / 2)

        checks.append(
            Check(
                "headroom at the galley",
                galley,
                1.600,
                0.060,
                "brochure p4",
                note='"stahojd nar du lagar mat"',
            )
        )
        checks.append(
            Check(
                "headroom over the saloon",
                saloon,
                1.470,
                0.070,
                "brochure p4",
                note="must be less than the galley, or the boast is empty",
            )
        )

    # --- Berths. "Sammanlagt fem personer, tva i forpiken och tre i salongen."
    checks.append(
        Check(
            "forepeak berth length",
            params.FOREPEAK_BERTH_END - params.FOREPEAK_BERTH_START,
            2.050,
            0.150,
            "brochure p4",
            note='"Forpik med fullangdskojer", two adults',
        )
    )
    checks.append(
        Check(
            "settee berth length",
            params.SETTEE_END - params.SETTEE_START,
            1.950,
            0.100,
            "brochure p4",
        )
    )
    checks.append(
        Check(
            "quarter berth length",
            params.QUARTER_BERTH_END - params.QUARTER_BERTH_START,
            1.950,
            0.150,
            "brochure p4",
        )
    )

    # --- The sole you walk down to reach them.
    checks.append(
        Check(
            "clear width between settees",
            params.SOLE_HALF_WIDTH * 2,
            0.520,
            0.080,
            "fitted",
        )
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
    blend_path = os.path.join(opts["project"], "blender", "maxi77.blend")

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
    checks += fittings_checks(by_name)

    # The accommodation, in the same report. One command and one exit code, so
    # a green hull cannot hide a cabin that has come adrift from it -- which is
    # the whole reason these were merged into one model.
    checks += interior_checks(by_name)

    return 0 if report(checks) else 1


if __name__ == "__main__":
    sys.exit(main())

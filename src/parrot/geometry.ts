const deg = (d: number) => (d * Math.PI) / 180

/**
 * Where Polly perches: the port half of the `cockpit_shelves` node, a
 * rounded corner shelf against the aft bulkhead beside the companionway —
 * top surface y 0.964, x -0.72..-0.54, z 1.28..1.37.
 *
 * Moved off the coachroof crown for open air above and a real ledge under
 * him, but the shelf is tight: the forward wall (the leaning `companionway`
 * panel) sits at z ~= 1.2565 at shelf height and leans further forward as it
 * rises, measured `z_wall(y) ~= 1.257 - 0.179*(y - 1.00)`. That leaves only
 * ~80 mm of clearance forward of the perch, and the bird's tail reaches
 * 112 mm — a heading near dead-aft drives the tail 37-51 mm through the
 * bulkhead. Invisible from the cockpit, since the panel occludes it, but it
 * would be a green tail poking into the cabin.
 *
 * At rest yaw 72 deg the tail swings outboard over the shelf edge instead
 * and clears the wall by 14 mm at the worst pose. Verified across rest, the
 * 18 deg wing shuffle, +/-45 deg head yaw, +22 deg head pitch and +/-6 deg
 * tail sway: feet stay on the shelf (x -0.686..-0.573, z 1.294..1.376) and
 * the crown reaches y 1.137 with nothing above it.
 *
 * Net effect: he sits side-on across the cockpit with his head craned back
 * at you — a normal parrot pose, not a compromise. (See `PARROT_REST_YAW`
 * for why the head range itself had to widen to make that turn work.)
 *
 * Its own module rather than living in `Parrot.tsx`: `CHAT_ANCHOR` below
 * needs it too, to place itself relative to the bird, and a plain data file
 * is what keeps both components from having to import one another.
 */
export const PARROT_POSITION: readonly [number, number, number] = [-0.62, 0.964, 1.338]

/**
 * Anchor for the chat balloon (`ParrotChat.tsx`, mounted via `<Html>` from
 * `ParrotAssistant.tsx`), defined next to `PARROT_POSITION` so the two don't
 * drift apart. Its own, smaller offset rather than reusing the perch point
 * directly: the balloon is a DOM panel, not a billboard plane, and the CSS
 * itself pushes it further up-and-right of this point so its tail lands on
 * the bird (see `ParrotChat.css`).
 */
export const CHAT_ANCHOR: readonly [number, number, number] = [
  PARROT_POSITION[0] + 0.1,
  PARROT_POSITION[1] + 0.2,
  PARROT_POSITION[2] + 0.06,
]

/**
 * Resting heading, in radians: 72 deg off dead-ahead, which puts him side-on
 * across the shelf with his tail swung outboard clear of the forward wall
 * (see `PARROT_POSITION`'s doc for the clearance this heading exists to
 * buy). The cockpit camera sits at +28.1 deg azimuth from the perch, so at
 * this rest yaw his head tracks the visitor at about a -44 deg turn — inside
 * `Parrot.tsx`'s `HEAD_YAW_RANGE` of 65 deg, which this rest yaw is the
 * reason that range had to widen from its old 52 deg. Lives here rather than
 * in `Parrot.tsx` because `CHAT_ANCHOR` reasons about the same perch and the
 * two should not drift apart.
 */
export const PARROT_REST_YAW = deg(72)

/** Feet-to-crown height, in metres, the model is scaled to. At ~2.0 m from
 *  the cockpit eye with a 50 deg vertical FOV, 0.16 m still subtends about
 *  9% of viewport height (~99 px at 1080p) — small, but legible: the beak,
 *  eye and wing panel remain readable at that size. Well under a real
 *  scarlet macaw's ~40 cm perched height. */
export const PARROT_HEIGHT = 0.16

/** The source mesh's own bounding-box height (model units); see
 *  `parrotRig.ts` for the coordinates that bbox was measured from. */
const MODEL_HEIGHT = 110.06

export const PARROT_SCALE = PARROT_HEIGHT / MODEL_HEIGHT

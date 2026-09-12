/**
 * The aspect policy shared by `SceneCanvas` (the live camera), `CameraRig`
 * (focus close-ups) and `IntroTitle` (the opening card).
 *
 * Every stop, close-up and the intro card were authored against a 16:9
 * frame at a fixed 50° vertical fov. A perspective camera's fov is vertical,
 * so narrowing the viewport toward portrait shrinks the *horizontal* field
 * only — at 390×844 the authored 79.3° horizontal field collapses to 24.2°,
 * cropping everything that was framed against its width. Widening the
 * vertical fov below the design aspect wins back the horizontal coverage the
 * frame was built around, at the cost of vertical field the visitor never
 * asked for.
 */

/** Vertical fov, in degrees, that every stop and close-up was authored against. */
export const DESIGN_FOV = 50

/** The aspect ratio the frame was authored at. Nothing widens above this. */
export const DESIGN_ASPECT = 16 / 9

/**
 * Ceiling on the widened vertical fov. Past this the perspective distortion
 * at the edges of frame reads as a fisheye rather than as "a wider view".
 */
export const MAX_FOV = 75

/**
 * Vertical fov (degrees) for a live viewport aspect.
 *
 * At or above the design aspect the frame is unchanged — this is the
 * desktop/landscape case, and every authored stop and close-up assumes
 * exactly `DESIGN_FOV`. Below it, the vertical fov is widened just enough to
 * hold the design's *horizontal* half-angle constant, so a narrow viewport
 * keeps the same horizontal coverage instead of cropping it, and only trades
 * away vertical field it never needed.
 */
export function fovForAspect(aspect: number): number {
  if (!Number.isFinite(aspect) || aspect <= 0) return DESIGN_FOV
  if (aspect >= DESIGN_ASPECT) return DESIGN_FOV

  const designVHalf = (DESIGN_FOV * Math.PI) / 360
  const hHalf = Math.atan(Math.tan(designVHalf) * DESIGN_ASPECT)
  const vFovRad = 2 * Math.atan(Math.tan(hHalf) / aspect)
  const vFovDeg = (vFovRad * 180) / Math.PI
  return Math.min(vFovDeg, MAX_FOV)
}

/**
 * How much further back a close-up's final leg must sit to keep its authored
 * horizontal composition on a viewport narrower than `DESIGN_ASPECT`.
 *
 * An earlier version of this tried to fit each target's click-forgiveness
 * `bounds` box into a fixed fraction of the live frame, but that box is
 * deliberately looser than the object's visible extent (see `CameraFocus`'s
 * own doc on `bounds`), so no fill fraction reproduces the authored
 * composition — the pull-back it computed fired even at the design aspect,
 * on every target. The fix is relative rather than absolute: whatever
 * fraction of the frame the subject occupied at `DESIGN_ASPECT`/`DESIGN_FOV`
 * is correct *by construction*, since that is what it was composed against.
 * Retreating by the ratio of "world width the design frame covered" to
 * "world width the live frame covers at the same distance" restores that
 * same horizontal coverage, whatever the live aspect and its widened fov are.
 *
 * Exactly 1 at or above `DESIGN_ASPECT`, by construction rather than by
 * luck — every authored leg is untouched on any landscape viewport.
 */
export function framingPullback(aspect: number): number {
  const live = Math.tan((fovForAspect(aspect) * Math.PI) / 360) * aspect
  const design = Math.tan((DESIGN_FOV * Math.PI) / 360) * DESIGN_ASPECT
  if (!Number.isFinite(live) || live <= 0) return 1
  return Math.max(design / live, 1)
}

// Lane geometry for background boat traffic. A lane is a straight line at a
// fixed perpendicular offset from the world origin, on an authored bearing —
// there is no pathfinding or steering, vessels just slide along `d`.

/** Which of the three traffic lanes a vessel belongs to. */
export type LaneId = 'near' | 'mid' | 'far'

/** Authored geometry and spawn statistics for one traffic lane. */
export type LaneDef = {
  id: LaneId
  /** Lane heading in world XZ, degrees, 0 = along -Z (the bow direction). */
  bearingDeg: number
  /** Perpendicular distance from the world origin; sign picks the side. */
  offsetM: number
  /** Lane runs from -halfLength to +halfLength about its closest point to origin. */
  halfLength: number
  /**
   * Concurrency cap at the high quality tier. This is the authored default;
   * Task 8 overrides it at runtime from `quality.ts`'s `traffic.maxConcurrent`,
   * so this value is never read directly by the renderer at low/medium tiers.
   */
  maxConcurrent: number
  /** Mean seconds between spawns, tuned so P(0 boats) lands near 37% (see scheduler.test.ts). */
  meanGapS: number
}

/**
 * Three lanes at increasing distance and length, so nearby traffic reads as
 * individual vessels and distant traffic reads as an occasional silhouette.
 */
export const LANES: readonly LaneDef[] = [
  { id: 'near', bearingDeg: 105, offsetM: 160, halfLength: 300, maxConcurrent: 3, meanGapS: 200 },
  { id: 'mid', bearingDeg: 20, offsetM: 320, halfLength: 600, maxConcurrent: 2, meanGapS: 260 },
  { id: 'far', bearingDeg: 75, offsetM: 850, halfLength: 1200, maxConcurrent: 1, meanGapS: 420 },
]

/** Unit vector along a bearing (degrees, 0 = -Z, clockwise looking down +Y). */
function bearingVector(bearingDeg: number): [number, number] {
  const rad = (bearingDeg * Math.PI) / 180
  return [Math.sin(rad), -Math.cos(rad)]
}

/** World position of a vessel at distance `d` along the lane. */
export function lanePoint(lane: LaneDef, d: number): [number, number] {
  const [dx, dz] = bearingVector(lane.bearingDeg)
  // The perpendicular (offset) direction is the along-lane direction rotated
  // +90 degrees about Y, which keeps offsetM's sign meaning "which side" consistently.
  const px = dz
  const pz = -dx
  return [px * lane.offsetM + dx * d, pz * lane.offsetM + dz * d]
}

/** Lane heading as a Y rotation in radians, for a vessel travelling in `dir`. */
export function laneHeading(lane: LaneDef, dir: 1 | -1): number {
  const rad = (lane.bearingDeg * Math.PI) / 180
  // Negated, not simply the bearing. Vessel models are normalised to point
  // along -Z, and this angle is applied straight to `rotation.y`. Rotating the
  // local bow (0, 0, -1) by theta about Y gives a world direction of
  // (-sin theta, -cos theta), while the lane's own travel direction is
  // (sin b, -cos b) — so theta = b lands the bow on the x-mirror of the way
  // the vessel is actually going. On the near lane, bearing 105, that had them
  // sailing sideways-backwards. theta = -b makes the two expressions equal.
  // `rails.test.ts` pins this by comparing the rotated bow vector against the
  // travel direction read off `lanePoint`, on every lane, in both directions.
  return dir === 1 ? -rad : Math.PI - rad
}

import { Edges } from '@react-three/drei'
import type { ExhibitHotspotProps } from '../types'

/**
 * The clickable volume over the safe, rendered only inside the `desk` close-up
 * (`Exhibits.tsx` gates a hotspot on both `scene` and `focus`).
 *
 * A box round the safe rather than the safe's own mesh, and transparent rather
 * than `visible={false}`, both for the reasons `FocusTargets.tsx` sets out: the
 * exported meshes are joined by material so there is no one mesh that is "the
 * safe", and an invisible object is not reliably raycast where a zero-opacity
 * one with no depth write is.
 *
 * Slightly larger than the 220 x 200 x 230 mm body so the door, its brass and
 * the slot are all inside the target. Nobody should have to hit the escutcheon.
 */
export function SafeHotspot({ hovered }: ExhibitHotspotProps) {
  return (
    <mesh>
      <boxGeometry args={[0.25, 0.26, 0.25]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      {/* An outline rather than a glow: what is clickable is a region of the
          cabin, and an outline is what says region. Same weight as the focus
          targets use, so the two read as one affordance rather than two. */}
      <Edges visible={hovered} color="#ffffff" transparent opacity={0.4} />
    </mesh>
  )
}

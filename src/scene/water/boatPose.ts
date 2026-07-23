import { Matrix4 } from 'three'

/**
 * The boat frame's world transform, inverted, shared the way `waves.ts` shares
 * the sea: one mutable the scene writes and the water shader reads, so the two
 * cannot disagree about where the hull is.
 *
 * `PortfolioWorld` composes this each frame from the same pose numbers it puts
 * on the boat group — not read back from the scene graph, whose matrices update
 * after the frame callbacks and would lag a frame behind. The sea shader
 * multiplies fragment world positions by it to get hull-local coordinates for
 * the "am I inside the boat?" test; a lagging matrix is exactly the kind of gap
 * this exists to close.
 */
export const boatWorldInverse = new Matrix4()

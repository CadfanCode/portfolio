import { Matrix4, Quaternion } from 'three'

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

/**
 * The world frame's rotation — the one the sea, the sky, the cloud and the sun
 * all ride in together, written by `PortfolioWorld` each frame beside the matrix
 * above.
 *
 * Anything parented to that frame turns with it, so a direction that is constant
 * *inside* the frame is not constant in world space. The sea shader needs the
 * sun as a world-space vector to light and reflect with, and its own sun must be
 * the one actually hanging in the sky — so it takes the frame-local sun and
 * turns it by this. Without it the glitter road on the water points at a sun the
 * sky is no longer showing, by exactly the angle the boat is heeled.
 */
export const worldFrameQuat = new Quaternion()

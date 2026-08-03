import { Canvas } from '@react-three/fiber'
import { Suspense } from 'react'
import { AdaptiveEvents, Preload } from '@react-three/drei'
import { PortfolioWorld } from './scene/PortfolioWorld'
import { selectDprCeiling, useQualityStore } from './state/useQualityStore'

/**
 * The Canvas, split out of `App` so that quality changes re-render as little as
 * possible.
 *
 * This file looks over-careful for what it does, and the care is load-bearing.
 * R3F applies every one of the Canvas's props inside a layout effect that has
 * **no dependency array** (`react-three-fiber.cjs.prod.js:89`, closing at :143),
 * so that effect runs on every single render of this component and re-applies
 * `dpr`, `camera`, `gl` and the rest from the current props. Two consequences
 * shape everything below:
 *
 *  1. Device pixel ratio has to be owned by the store and passed as a prop.
 *     Setting it imperatively — R3F's `setDpr`, which is what `PerformanceMonitor`
 *     reaches for by default — works exactly until the next render of this
 *     component, at which point the prop is re-applied over the top of it and the
 *     adaptation silently vanishes. Routing it through the store means the prop
 *     and the live value are the same thing and can never disagree.
 *
 *  2. Nothing else may subscribe here. Every extra store field read in this
 *     component is another reason to re-render the Canvas, and every re-render
 *     is a full re-application of all of its props. Two narrow selectors, and
 *     they stay two.
 */

// Module constants rather than inline object literals. An inline `camera={{...}}`
// — which is what this was before — is a fresh object on every render, so it
// fails the identity check in that same effect and re-applies the camera every
// time the DPR moves.
const CAMERA = { position: [11, 6, -9] as [number, number, number], fov: 50 }

// `antialias: false` because the only thing ever drawn to the default framebuffer
// is a full-screen quad from `Effects.tsx`'s offscreen `EffectComposer` — there
// are no geometric edges here for context MSAA to smooth, so the multisampled
// framebuffer and its per-frame resolve blit would be pure cost. The composer's
// own `multisampling` and its SMAA/FXAA pass already do the antialiasing.
// `alpha: false` drops the canvas's alpha channel; the scene always fills the
// frame, so the compositor never needs to blend it against the page.
const GL = { antialias: false, alpha: false }

/**
 * Hoisted out of the component so the element identity never changes.
 *
 * React bails out of re-rendering a subtree whose element reference it has seen
 * before, so when the DPR changes this whole tree — the boat, the ocean, the post
 * stack — is skipped entirely and only the Canvas itself reconciles. Without
 * this, every DPR adjustment would walk the full 3D tree.
 *
 * Loading the boat GLB suspends, so the world sits behind a Suspense boundary.
 */
const WORLD = (
  <Suspense fallback={null}>
    <PortfolioWorld />
    {/* Runs `gl.compile()` on everything under it once loading finishes, so the
        shader compilation for the boat's ~37 materials, ~89 meshes, the sail
        `onBeforeCompile` patches and the custom `ShaderMaterial`s happens while
        the visitor is still looking at the loading veil, instead of stuttering
        the first seconds of the scene. */}
    <Preload all />
  </Suspense>
)

export function SceneCanvas() {
  // These two, and only these two. See the note above.
  //
  // `dprCeiling` folds `dprMax`, `dprScale` and the close-up override into one
  // primitive so this only re-renders when the number a visitor would actually
  // see change moves — which, for `closeUp`, is exactly twice per close-up:
  // once on entry and once on exit. See `selectDprCeiling`.
  const dprCeiling = useQualityStore(selectDprCeiling)
  const shadowFilter = useQualityStore((s) => s.settings.shadows.filter)

  return (
    // `shadows` turns on the shadow map the sun light needs, and picks the filter:
    // PCF soft where there is budget for it, plain PCF below. It is never off —
    // the cabin is dark *because* of the shadow map, so without one the sun floods
    // the interior straight through the coachroof. See `PortfolioWorld.tsx`.
    //
    // The camera prop matches the ocean stop's pose so the first frame is already
    // framed — see `cameraStops.ts`.
    //
    // `frameloop` is deliberately left at its default `'always'` — the sea,
    // weather, sails and boat pose all animate continuously even when the visitor
    // isn't moving the camera, so `frameloop="demand"` would freeze the scene
    // solid. Do not "optimise" this to demand mode.
    <Canvas
      shadows={shadowFilter}
      dpr={[1, dprCeiling]}
      camera={CAMERA}
      gl={GL}
    >
      {WORLD}
      {/* Drops pointer raycasting while performance is degraded. */}
      <AdaptiveEvents />
    </Canvas>
  )
}

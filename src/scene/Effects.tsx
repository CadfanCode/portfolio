import {
  Bloom,
  ChromaticAberration,
  DepthOfField,
  EffectComposer,
  FXAA,
  N8AO,
  Noise,
  SMAA,
  ToneMapping,
  Vignette,
} from '@react-three/postprocessing'
import { BlendFunction, ToneMappingMode } from 'postprocessing'
import { useMemo, type ReactElement } from 'react'
import { Vector2, Vector3 } from 'three'
import { useQualityStore } from '../state/useQualityStore'
import { useSceneStore } from '../state/useSceneStore'
import { CAMERA_FOCUS } from './cameraFocus'

// Chromatic aberration is a fixed screen-space offset; a Vector2 built once and
// reused avoids handing the effect a fresh object every render.
const CA_OFFSET = new Vector2(0.0005, 0.0005)

/**
 * The post stack.
 *
 * Everything here is image-space polish the forward renderer cannot do on its
 * own — it is what closes most of the gap between "a lit CAD model" and "a
 * photograph of a boat". Nothing in it simulates anything; it reads the colour,
 * depth and normals of the frame already rendered and grades them. That keeps
 * it squarely inside the project's "fake cheap effects over real simulation"
 * rule — this is the cheap effect, spent on the one axis a portfolio lives on.
 *
 * Order is deliberate, top to bottom is order applied:
 *
 *  - N8AO first, in the HDR pass, so ambient occlusion darkens the contact
 *    seams (where cushion meets berth, where a fitting meets the deck) before
 *    anything else touches them. This is the single biggest "grounded in
 *    reality" cue and the loudest thing missing before.
 *  - Bloom, thresholded high so only genuine highlights — sun glint on
 *    stainless and on the water — bleed, not the whole bright deck.
 *  - Depth of field, but only at the cabin stop (see below).
 *  - A whisper of chromatic aberration for a lens, not a glitch.
 *  - Tone mapping. This one is not optional: `EffectComposer` forces the
 *    renderer's own tone mapping off while it is mounted, so without an ACES
 *    pass here the whole scene renders untonemapped and blows out. Re-applying
 *    ACES keeps the look identical to the tuned forward render.
 *  - Vignette and a faint film grain last, over the graded image, to settle it
 *    and hide the banding a smooth sky always shows.
 *  - The resolve-time antialias closes it out, and it is never absent: the
 *    Canvas now runs with `antialias: false`, since the composer renders
 *    offscreen and context MSAA would have been resolving a buffer nothing
 *    samples. What is left is deliberate. `EffectComposer multisampling`
 *    handles geometric edges on the top tier; SMAA or FXAA handle *specular*
 *    aliasing on every tier, which MSAA does nothing for — crawling
 *    highlights on the thin rigging and stainless against a bright sky is the
 *    loudest realtime tell there is, so this is the one thing scaled to
 *    "cheaper", never to "off". FXAA is the bottom-tier pick not because it
 *    looks as good as SMAA but because it is a non-convolution effect, so the
 *    library folds it into the same `EffectPass` as the mandatory tone
 *    mapping below rather than costing a pass of its own.
 *
 * `ChromaticAberration`, `ToneMapping`, `Vignette` and `Noise` are the other
 * three non-convolution effects sharing that pass, and none of them read
 * from the quality table. They are already close to free once the pass
 * exists for tone mapping, so tiering them would trade three more branches
 * for a fraction of an ALU each — not worth it.
 */
export function Effects() {
  const scene = useSceneStore((s) => s.scene)
  const focus = useSceneStore((s) => s.focus)
  const inCabin = scene === 'cabin'
  // A stable sub-object of a frozen module-constant table (`QUALITY[tier].post`
  // — see `quality.ts`), so this subscription only re-renders `Effects` when
  // the tier itself changes, which is never mid-session. Safe to read once
  // here rather than threading it through each pass below.
  const post = useQualityStore((s) => s.settings.post)

  // What the lens is focused on while a close-up is open, if one is. The
  // registry entries are module constants, so this is stable for as long as the
  // close-up is.
  const subject = useMemo(() => {
    const view = focus ? CAMERA_FOCUS[focus] : null
    return view ? new Vector3(...view.bounds.centre) : null
  }, [focus])

  // Built as an array so the depth-of-field pass can be dropped entirely off the
  // ocean and cockpit — a missing pass, not a disabled one, so it costs nothing
  // where it is not wanted. The composer only wires up the Effect children and
  // ignores the rest, so ordering here is the order applied.
  const passes = [
    // The heaviest pass in the stack, and the one real exception to "turn it
    // down, not off" — at the bottom tier the contact shadows are not worth
    // the frame. The look constants (radius, falloff, intensity, colour) stay
    // hand-tuned and inline; only the sample counts come from the table.
    post.ao ? (
      <N8AO
        key="ao"
        aoRadius={0.7}
        distanceFalloff={1}
        intensity={2}
        halfRes
        color="#0a1418"
        {...post.ao}
      />
    ) : null,
    <Bloom
      key="bloom"
      mipmapBlur
      // Raised while a close-up is open: gilt spine lettering and white page
      // text are bright enough at arm's length to catch the default 0.85
      // threshold and bloom into mush, which is exactly the opposite of what a
      // reading shot needs. 0.95 leaves genuine specular — the sun on
      // stainless and water — untouched everywhere else.
      luminanceThreshold={focus !== null ? 0.95 : 0.85}
      luminanceSmoothing={0.2}
      intensity={0.5}
      levels={post.bloomLevels}
    />,
    // Close focus on the joinery, companionway soft behind — the cabin is the
    // one stop where you are at arm's length from a surface, so it is the one
    // stop that reads better shallow. Everywhere else the subject is the whole
    // boat and everything should stay sharp, so DOF is off. Distances are in
    // metres from the lens: the saloon table sits ~1.6 m ahead.
    //
    // In a close-up the lens focuses on the object instead, and it has to. The
    // plane above is fixed at 1.6 m because that is where the saloon is from
    // the stop — but a close-up is 0.3 m off a book spine, which is 1.3 m
    // inside the near blur and the reason the books were soft. `target` is the
    // effect's own auto-focus: it measures the camera to that point every frame
    // and focuses there, so the object is sharp on approach as well as at rest.
    // The range widens and the bokeh comes down to go with it — at this
    // distance the whole object has to be inside the sharp band, not just the
    // face of it, and 2.4 of bokeh on a background 200 mm behind a book is a
    // smear rather than a depth cue.
    post.dof && inCabin ? (
      subject ? (
        <DepthOfField
          key="dof-close"
          target={subject}
          worldFocusRange={1.4}
          bokehScale={1.6}
        />
      ) : (
        <DepthOfField
          key="dof"
          worldFocusDistance={1.6}
          worldFocusRange={2.2}
          bokehScale={2.4}
        />
      )
    ) : null,
    <ChromaticAberration
      key="ca"
      offset={CA_OFFSET}
      radialModulation
      modulationOffset={0.3}
    />,
    <ToneMapping key="tone" mode={ToneMappingMode.ACES_FILMIC} />,
    <Vignette key="vignette" offset={0.32} darkness={0.42} />,
    <Noise key="grain" premultiply blendFunction={BlendFunction.OVERLAY} opacity={0.035} />,
    // FXAA is a blur filter, and a close-up is a near-static shot of small
    // text — exactly what that blur is worst for. So SMAA runs unconditionally
    // while a close-up is open, even on the `low` tier where FXAA is normally
    // the pick. `focus` already causes `passes` to be rebuilt on every
    // close-up open and close (the DOF branch above reads it too), so this
    // swap rides along for free.
    focus !== null || post.aa === 'smaa' ? <SMAA key="smaa" /> : <FXAA key="fxaa" />,
  ].filter((pass): pass is ReactElement => pass !== null)

  return (
    <EffectComposer multisampling={post.multisampling} enableNormalPass={false}>
      {passes}
    </EffectComposer>
  )
}

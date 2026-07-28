import {
  Bloom,
  ChromaticAberration,
  DepthOfField,
  EffectComposer,
  N8AO,
  Noise,
  SMAA,
  ToneMapping,
  Vignette,
} from '@react-three/postprocessing'
import { BlendFunction, ToneMappingMode } from 'postprocessing'
import { useMemo, type ReactElement } from 'react'
import { Vector2, Vector3 } from 'three'
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
 *  - SMAA closes it out. The default MSAA does nothing for *specular*
 *    aliasing, and specular aliasing — crawling highlights on the thin rigging
 *    and stainless against a bright sky — is the loudest realtime tell there
 *    is. SMAA resolves the finished image and takes most of it out.
 */
export function Effects() {
  const scene = useSceneStore((s) => s.scene)
  const focus = useSceneStore((s) => s.focus)
  const inCabin = scene === 'cabin'

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
    <N8AO
      key="ao"
      aoRadius={0.7}
      distanceFalloff={1}
      intensity={2}
      aoSamples={16}
      denoiseSamples={4}
      denoiseRadius={12}
      halfRes
      color="#0a1418"
    />,
    <Bloom
      key="bloom"
      mipmapBlur
      luminanceThreshold={0.85}
      luminanceSmoothing={0.2}
      intensity={0.5}
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
    inCabin ? (
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
    <SMAA key="smaa" />,
  ].filter((pass): pass is ReactElement => pass !== null)

  return (
    <EffectComposer multisampling={4} enableNormalPass={false}>
      {passes}
    </EffectComposer>
  )
}

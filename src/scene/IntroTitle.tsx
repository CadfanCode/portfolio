import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { CanvasTexture, Object3D, Vector3 } from 'three'
import type { ShaderMaterial } from 'three'
import { useSceneStore } from '../state/useSceneStore'
import {
  INTRO_HOLD_START,
  TITLE_FADE_IN_END,
  TITLE_FADE_IN_START,
  TITLE_FADE_OUT_END,
  TITLE_FADE_OUT_START,
  TITLE_HEIGHT,
  TITLE_LINES,
  TITLE_POSITION,
  TITLE_WIDTH,
} from './introFlight'
import { smoothstep } from './mathUtils'

const CANVAS_WIDTH = 2048
const CANVAS_HEIGHT = 1024

// The same font stack `index.css`'s `--heading` uses, so the card reads as
// the same typeface as the rest of the site rather than the browser default.
const FONT_STACK = "system-ui, 'Segoe UI', Roboto, sans-serif"

/** The card's fixed world position and the point the hold beat opens looking at — both static, so hoisted once rather than rebuilt per frame. */
const titlePosition = new Vector3(...TITLE_POSITION)
const holdStart = new Vector3(...INTRO_HOLD_START)

/** Seconds the safety-net fade takes if a skip lands mid-fade during the hold. */
const SKIP_FADE_OUT = 0.4

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

// The hash/vnoise/fbm trio is `IntroClouds`' own (itself copied from
// `Weather.tsx`), copied again rather than reimplemented so the sky glimpsed
// through the letters is made of the same noise as the weather around it.
const fragmentShader = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uMask;
  uniform float uOpacity;
  uniform float uTime;

  float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
  float vnoise(vec2 p){
    vec2 i = floor(p); vec2 f = fract(p);
    f = f*f*(3.0-2.0*f);
    float a=hash(i), b=hash(i+vec2(1,0)), c=hash(i+vec2(0,1)), d=hash(i+vec2(1,1));
    return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
  }
  float fbm(vec2 p){
    float v=0.0, a=0.5;
    for(int i=0;i<4;i++){ v += a*vnoise(p); p*=2.0; a*=0.5; }
    return v;
  }

  void main() {
    float core = texture2D(uMask, vUv).a;

    // A cheap dilation of the mask: average it across twelve offsets over two
    // small radii. Subtracting the glyph itself back off leaves only the band
    // just *outside* the letterforms, which is drawn as a tight dark contour
    // below. Deliberately close in — a wide diffuse glow reads as fog around
    // the text, a tight one reads as weight in it.
    const int HALO_SAMPLES = 6;
    const float TAU = 6.28318530718;
    const float R1 = 0.004;
    const float R2 = 0.009;
    float spread = 0.0;
    for (int i = 0; i < HALO_SAMPLES; i++) {
      float angle = TAU * float(i) / float(HALO_SAMPLES);
      vec2 dir = vec2(cos(angle), sin(angle));
      spread += texture2D(uMask, vUv + dir * R1).a;
      spread += texture2D(uMask, vUv + dir * R2).a;
    }
    spread /= float(HALO_SAMPLES) * 2.0;
    float rim = clamp(spread - core, 0.0, 1.0);

    // The fill: a procedural clear-sky gradient. Every stop is *dark*, and
    // that is the whole point rather than a style preference — the card is
    // read against IntroClouds' whiteout quad at #cfdae4 and ~0.97 opacity,
    // which is a very light field, so the letters can only carry contrast by
    // being darker than it. An earlier pass ran this gradient up to a
    // near-white at the bottom of the card and measured 1.0:1 against the
    // haze directly under the subtitle — invisible. These stops measure
    // 7.7:1 at the subtitle row, 8.3:1 at the name and 10.5:1 at the top edge
    // (worst case across the drift term's whole range), so the card clears
    // WCAG AAA everywhere text actually sits. The card's own bottom edge
    // bottoms out at 5.7:1, which is AA and carries no glyphs.
    //
    // It is also the more honest read of the conceit: clear sky seen from
    // above a cloud deck is a deep, near-navy blue, much darker than the
    // cloud it is glimpsed through — not brighter.
    vec3 zenith = vec3(0.03, 0.08, 0.24);
    vec3 midSky = vec3(0.05, 0.17, 0.46);
    vec3 lowSky = vec3(0.07, 0.30, 0.60);
    vec3 sky = mix(lowSky, midSky, smoothstep(0.0, 0.55, vUv.y));
    sky = mix(sky, zenith, smoothstep(0.55, 1.0, vUv.y));

    // The sun, well above the name line so its lift never lands on a glyph
    // row, and mixed toward a luminous cerulean rather than added as raw
    // brightness — adding washes the gradient out towards white, which is
    // exactly the failure this palette exists to avoid.
    vec3 sunTint = vec3(0.18, 0.48, 0.85);
    float sunDist = distance(vUv, vec2(0.70, 0.86));
    sky = mix(sky, sunTint, exp(-sunDist * sunDist * 14.0) * 0.35);

    float drift = fbm(vUv * 3.0 + vec2(uTime * 0.015, uTime * 0.01));
    sky *= 0.93 + 0.09 * drift;

    // The contour: darker than any stop in the gradient, so it separates the
    // letterforms from the haze and thickens them at the same time.
    vec3 rimColor = vec3(0.02, 0.06, 0.16);

    vec3 rgb = mix(rimColor, sky, core);
    float alpha = clamp(core + rim * 0.6, 0.0, 1.0) * uOpacity;
    gl_FragColor = vec4(rgb, alpha);
  }
`

/**
 * The title card for the opening's new hold beat: the camera hangs near-level
 * in the cloud tops and this fades in, holds, and fades out ahead of it. A
 * single canvas-texture plane rather than drei's `Text`: troika fetches its
 * font from a CDN, and a baked canvas is the cheap-effect this project
 * prefers for text that never changes at runtime (see `IntroClouds` for the
 * same philosophy applied to the deck itself). The canvas this time is only
 * an alpha mask — white glyphs on transparent — because the actual colour
 * comes from the shader below: the letterforms are a window through the
 * overcast onto the clear sky above it, not flat ink.
 *
 * `renderOrder={1000}` and `depthTest={false}` are load-bearing together with
 * `IntroClouds`' own whiteout quad, which draws at `renderOrder={999}` and
 * reaches ~0.96 opacity at the hold's altitude — without outranking it here,
 * the card would be invisible under the whiteout for the whole beat.
 *
 * Renders nothing outside the `'holding'`/`'playing'` phases, so it costs
 * nothing before the hold starts or after the intro is `'done'` — same
 * contract as `IntroClouds`.
 */
export function IntroTitle() {
  const intro = useSceneStore((s) => s.intro)
  const gl = useThree((s) => s.gl)

  const material = useRef<ShaderMaterial>(null)
  /** Seconds into the hold beat, accumulated locally rather than read off the rig — the rig's own `holdElapsed` is private to `CameraRig`. */
  const elapsed = useRef(0)

  // The card's orientation never changes, so it is computed once via a scratch
  // Object3D rather than tracked as state. `lookAt` is all that is needed and
  // nothing may be added after it: on an ordinary Object3D it aims local **+Z**
  // at the target — only cameras and lights look down -Z — and +Z is exactly
  // the face a `planeGeometry` is printed on. Spinning the card afterwards to
  // "correct" for the camera convention turns its printed face away from the
  // lens, and with the default `FrontSide` material that is an invisible card
  // for the whole shot.
  const quaternion = useMemo(() => {
    const dummy = new Object3D()
    dummy.position.copy(titlePosition)
    dummy.lookAt(holdStart)
    return dummy.quaternion.clone()
  }, [])

  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = CANVAS_WIDTH
    canvas.height = CANVAS_HEIGHT
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
      ctx.textBaseline = 'middle'
      ctx.fillStyle = '#ffffff'

      // Both lines are drawn glyph by glyph: canvas 2D has no `letter-spacing`.
      // Returns the width it drew, so the rule below can be sized off the name.
      const drawTracked = (text: string, spacing: number, y: number) => {
        const widths = [...text].map((ch) => ctx.measureText(ch).width)
        const total = widths.reduce((sum, w) => sum + w, 0) + spacing * (text.length - 1)
        let x = CANVAS_WIDTH / 2 - total / 2
        for (let i = 0; i < text.length; i++) {
          ctx.fillText(text[i], x, y)
          x += widths[i] + spacing
        }
        return total
      }

      ctx.textAlign = 'left'

      // Heavy and close-tracked. The earlier pass used a 300 weight with wide
      // tracking, which is the right idiom for a title over *film* — a dark
      // frame with thin bright type on it. Here the field is near-white haze,
      // and thin strokes at that size simply dissolve into it whatever colour
      // they are, so the weight is doing legibility work rather than styling.
      // Tracking is kept small for the same reason: it keeps stroke density up.
      const name = TITLE_LINES.name
      const NAME_SPACING = 6
      // Shrink to fit rather than run off the card if the name is ever edited.
      let nameSize = 250
      const fitName = () => {
        ctx.font = `800 ${nameSize}px ${FONT_STACK}`
        return (
          [...name].reduce((sum, ch) => sum + ctx.measureText(ch).width, 0) +
          NAME_SPACING * (name.length - 1)
        )
      }
      while (fitName() > CANVAS_WIDTH * 0.88 && nameSize > 80) nameSize -= 10
      const nameWidth = drawTracked(name, NAME_SPACING, CANVAS_HEIGHT * 0.36)

      // The rule, thick enough to belong to the heavier type above it. Sits
      // clear of the name's baseline (~y 456 at the default size) rather than
      // tucked right under it.
      const ruleWidth = nameWidth * 0.5
      ctx.fillRect(CANVAS_WIDTH / 2 - ruleWidth / 2, CANVAS_HEIGHT * 0.53 - 3, ruleWidth, 6)

      // The subtitle: uppercase and still widely tracked so it reads as a
      // credit line rather than a second heading, but bold and half again the
      // size it was — at 55 m even this is only ~45 px tall on a 1080p screen.
      ctx.font = `700 80px ${FONT_STACK}`
      drawTracked(TITLE_LINES.subtitle.toUpperCase(), 22, CANVAS_HEIGHT * 0.67)
    }

    const tex = new CanvasTexture(canvas)
    tex.anisotropy = gl.capabilities.getMaxAnisotropy()
    tex.needsUpdate = true
    return tex
  }, [gl])

  // The texture is baked once per mount; dispose it on the way out rather
  // than leaving it for the GC, same as any other GPU resource this project
  // owns directly.
  useEffect(() => () => texture.dispose(), [texture])

  const uniforms = useMemo(
    () => ({
      uMask: { value: texture },
      uOpacity: { value: 0 },
      uTime: { value: 0 },
    }),
    [texture],
  )

  useFrame((state, delta) => {
    const mat = material.current
    if (!mat) return

    mat.uniforms.uTime.value = state.clock.elapsedTime

    if (intro === 'holding') {
      elapsed.current += delta
      const fadeIn = smoothstep(TITLE_FADE_IN_START, TITLE_FADE_IN_END, elapsed.current)
      const fadeOut = 1 - smoothstep(TITLE_FADE_OUT_START, TITLE_FADE_OUT_END, elapsed.current)
      mat.uniforms.uOpacity.value = fadeIn * fadeOut
      return
    }

    // 'playing': the card has normally already faded to 0 by the time the
    // plummet starts. This is the safety net for a skip landing mid-fade —
    // decay smoothly rather than popping, then hold at 0 for the rest of the
    // flight.
    mat.uniforms.uOpacity.value = Math.max(mat.uniforms.uOpacity.value - delta / SKIP_FADE_OUT, 0)
  })

  if (intro !== 'holding' && intro !== 'playing') return null

  return (
    <mesh
      position={titlePosition}
      quaternion={quaternion}
      renderOrder={1000}
      frustumCulled={false}
    >
      <planeGeometry args={[TITLE_WIDTH, TITLE_HEIGHT]} />
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        transparent
        depthTest={false}
        depthWrite={false}
        fog={false}
      />
    </mesh>
  )
}

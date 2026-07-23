import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useRef } from 'react'
import { Mesh } from 'three'
import type { Material, WebGLProgramParametersWithUniforms } from 'three'
import { useSceneStore } from '../state/useSceneStore'
import { usePointerSelect } from './usePointerSelect'
import { windStrength } from './wind'
import modelUrl from '../assets/models/maxi77.glb?url'

/** The names of the two cloth sails in the GLB, the only meshes that flutter. */
const SAIL_MESHES = new Set(['mainsail', 'genoa'])

type PatchedMaterial = Material & {
  userData: { shader?: WebGLProgramParametersWithUniforms }
}

/**
 * The Maxi 77, loaded from the generated GLB.
 *
 * No transform on the model: it is exported waterline-at-origin, bow at -Z, Y up
 * (see the axis note in `blender/params.py`), so it drops straight in. It sits
 * inside the scene's boat frame, which is what heaves, pitches, rolls and heels
 * it — see `PortfolioWorld`. This component only loads it, turns shadows on, and
 * stirs the sails.
 *
 * The sails react to the wind by a vertex ripple, not a cloth sim: the shared
 * `sailcloth` material (both sails carry the same one) gets a small along-normal
 * wave injected into the standard shader, and its depth is driven by the same
 * `windStrength` the boat heels to. Lighter, gustier air stirs the cloth more; a
 * steady press holds it quieter — the look of a sail working, cheaply.
 */
export function Boat() {
  const scene = useSceneStore((s) => s.scene)
  const goTo = useSceneStore((s) => s.goTo)
  const { scene: model } = useGLTF(modelUrl)

  const sailShader = useRef<WebGLProgramParametersWithUniforms | null>(null)

  // From the ocean stop the whole boat is the hotspot: click it to come aboard.
  const { bind } = usePointerSelect({
    enabled: scene === 'ocean',
    onSelect: () => goTo('cockpit'),
  })

  useLayoutEffect(() => {
    let patched = false

    model.traverse((object) => {
      if (!(object instanceof Mesh)) return
      // Shadows are opt-in per mesh in three, and the exporter does not set them.
      object.castShadow = true
      object.receiveShadow = true

      // Inject a wind ripple into the sail material's vertex stage. Both sails
      // share one material, so patching the first sail seen drives both.
      if (patched || !SAIL_MESHES.has(object.name) || Array.isArray(object.material)) {
        return
      }
      const material = object.material as PatchedMaterial
      patched = true
      if (material.userData.shader) return

      material.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = { value: 0 }
        shader.uniforms.uFlutter = { value: 0.5 }
        shader.vertexShader = shader.vertexShader
          .replace(
            '#include <common>',
            `#include <common>
             uniform float uTime;
             uniform float uFlutter;`,
          )
          .replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
             // A travelling diagonal wave across the cloth. Kept small, and
             // faded in only high on the sail (position.y is height in metres):
             // near zero over the lower two-thirds, so it never lifts the cloth
             // past the registration or the batten pockets stitched into it, and
             // strongest up by the head where a real leech actually lives.
             float wave = sin(position.y * 2.0 + position.x * 1.3 - uTime * 3.0);
             float lift = smoothstep(7.0, 9.6, position.y);
             transformed += normal * wave * 0.018 * lift * uFlutter;`,
          )
        material.userData.shader = shader
        sailShader.current = shader
      }
      material.needsUpdate = true
    })
  }, [model])

  useFrame((state) => {
    const shader = sailShader.current
    if (!shader) return
    const t = state.clock.elapsedTime
    shader.uniforms.uTime.value = t
    // A working sail in a steady press is quieter; in light, shifting air it
    // stirs. So more flutter as the wind eases.
    shader.uniforms.uFlutter.value = 0.3 + 0.7 * (1 - windStrength(t))
  })

  return (
    <group {...bind}>
      <primitive object={model} />
    </group>
  )
}

useGLTF.preload(modelUrl)

import { useGLTF } from '@react-three/drei'
import { useLayoutEffect } from 'react'
import { Mesh } from 'three'
import { useSceneStore } from '../state/useSceneStore'
import { usePointerSelect } from './usePointerSelect'
import modelUrl from '../assets/models/maxi77.glb?url'

/**
 * The Maxi 77, loaded from the generated GLB.
 *
 * No transform: the model is exported waterline-at-origin, bow at -Z, Y up (see
 * the axis note in `blender/params.py`), which is the scene's own convention, so
 * it drops straight in. The whole boat is one asset — hull, deck, rig, sails and
 * the accommodation — because the camera path passes through the companionway
 * and both halves have to be present at once (see `blender/build.py`).
 */
export function Boat() {
  const scene = useSceneStore((s) => s.scene)
  const goTo = useSceneStore((s) => s.goTo)
  const { scene: model } = useGLTF(modelUrl)

  // From the ocean stop the whole boat is the hotspot: click it to come aboard.
  const { bind } = usePointerSelect({
    enabled: scene === 'ocean',
    onSelect: () => goTo('cockpit'),
  })

  // Shadows are opt-in per mesh in three, and the exporter does not set them.
  // Every mesh both casts and receives: the coachroof shadows the side deck, the
  // boom shadows the cabin top, and the hull takes its own rigging's shadow.
  useLayoutEffect(() => {
    model.traverse((object) => {
      if (object instanceof Mesh) {
        object.castShadow = true
        object.receiveShadow = true
      }
    })
  }, [model])

  return (
    <group {...bind}>
      <primitive object={model} />
    </group>
  )
}

useGLTF.preload(modelUrl)

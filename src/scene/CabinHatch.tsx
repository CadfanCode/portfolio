import { useSceneStore } from '../state/useSceneStore'
import { Hotspot } from './Hotspot'

/**
 * The way below deck, and back up again. Both edges already exist in
 * SCENE_LINKS, so this only supplies the markers that trigger them.
 */
export function CabinHatch() {
  const scene = useSceneStore((s) => s.scene)
  const isTransitioning = useSceneStore((s) => s.isTransitioning)
  const goTo = useSceneStore((s) => s.goTo)

  if (scene === 'cockpit') {
    return (
      <Hotspot
        position={[0, 1.05, -0.5]}
        label="Go below deck"
        enabled={!isTransitioning}
        onSelect={() => goTo('cabin')}
      />
    )
  }

  if (scene === 'cabin') {
    return (
      <Hotspot
        position={[0, 0.35, -2]}
        label="Return to the cockpit"
        enabled={!isTransitioning}
        onSelect={() => goTo('cockpit')}
      />
    )
  }

  return null
}

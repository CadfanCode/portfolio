import { useSceneStore } from '../state/useSceneStore'
import { Hotspot } from './Hotspot'

/**
 * The way below deck, and back up again. Both edges already exist in
 * SCENE_LINKS, so this only supplies the markers that trigger them.
 *
 * Both markers sit in the companionway itself, which the model puts at
 * z 1.17…1.37, y 0.51…1.39 — the opening in the aft face of the coachroof. They
 * are placed a few centimetres either side of it rather than on it, so each is
 * on the near side of the hatch from wherever you are standing: from the
 * cockpit you are looking forward at the opening, from the cabin you have
 * turned round and are looking aft up the steps at it. Hung in world space
 * because they live inside the boat frame (see `PortfolioWorld`), which is the
 * identity whenever the camera is aboard.
 */
export function CabinHatch() {
  const scene = useSceneStore((s) => s.scene)
  const focus = useSceneStore((s) => s.focus)
  const isTransitioning = useSceneStore((s) => s.isTransitioning)
  const goTo = useSceneStore((s) => s.goTo)

  // Nothing to navigate to from inside a close-up. The camera is locked on an
  // object, and a marker for a hatch you cannot turn to look at would only be
  // something to click by accident.
  if (focus) return null

  if (scene === 'cockpit') {
    return (
      <Hotspot
        position={[0, 1.0, 1.44]}
        label="Go below deck"
        enabled={!isTransitioning}
        onSelect={() => goTo('cabin')}
      />
    )
  }

  if (scene === 'cabin') {
    return (
      <Hotspot
        position={[0, 0.86, 1.12]}
        label="Return to the cockpit"
        enabled={!isTransitioning}
        onSelect={() => goTo('cockpit')}
      />
    )
  }

  return null
}

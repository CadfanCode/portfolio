import { Edges } from '@react-three/drei'
import { useSceneStore } from '../state/useSceneStore'
import { useComingSoonStore } from '../state/useComingSoonStore'
import { FOCUS_LIST, type CameraFocus } from './cameraFocus'
import { usePointerSelect } from './usePointerSelect'

/**
 * The things in the cabin you can click to be taken in for a closer look.
 *
 * One invisible box per close-up, sitting over the object it belongs to. Not a
 * marker floating beside it, and not the object's own mesh either, and both of
 * those are deliberate:
 *
 * A marker would be the app's existing idiom — `CabinHatch` uses one, and they
 * are honest about being UI. But the brief was to click *the desk*, *the
 * books*, *the radio*, and there is a real difference between a boat with three
 * yellow balls in it and a boat you can touch.
 *
 * The object's own mesh would be the purest version of that, and it is a worse
 * target than it sounds. The exported meshes are joined by material, not by
 * object: `desk_safe` is body and door and hinges, `book_resume` is one book's
 * cloth case and nothing else, and the chart is a separate mesh again. Hit-
 * testing them means naming a dozen meshes and still asking someone to land a
 * cursor on a 36 mm book spine from across the cabin.
 *
 * So: a box round each, sized in `cameraFocus.ts` next to the framing it opens.
 * Transparent rather than `visible={false}` — an invisible object is not
 * reliably raycast, and a zero-opacity one with no depth write costs a draw
 * call and is never wrong about it.
 */

/** How strongly the outline shows when the pointer is over a target. Low: this
 *  is a hint that something is clickable, not a selection. */
const HOVER_OPACITY = 0.4

function FocusTarget({ view }: { view: CameraFocus }) {
  const isTransitioning = useSceneStore((s) => s.isTransitioning)
  const focusOn = useSceneStore((s) => s.focusOn)
  const showComingSoon = useComingSoonStore((s) => s.show)

  const { hovered, bind } = usePointerSelect({
    enabled: !isTransitioning,
    onSelect: () => {
      focusOn(view.id)
      // The camera work is real even where the exhibit isn't yet — see
      // `CameraFocus['placeholder']`'s own doc — so the toast rides along
      // with the fly-in rather than replacing it.
      if (view.placeholder) showComingSoon('Coming soon')
    },
  })

  return (
    <mesh position={view.bounds.centre} name={view.label} {...bind}>
      <boxGeometry args={view.bounds.size} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      {/* The affordance. A wire box round the object rather than a glow on it,
          because the object is not what is being highlighted — the thing you
          can click is a region of the cabin, and an outline says region. */}
      <Edges visible={hovered} color="#ffffff" transparent opacity={HOVER_OPACITY} />
    </mesh>
  )
}

/** Every close-up target belonging to the current stop. Hidden inside a
 *  close-up, so the only way out of one is the exit control. */
export function FocusTargets() {
  const scene = useSceneStore((s) => s.scene)
  const focus = useSceneStore((s) => s.focus)

  if (focus) return null

  return (
    <>
      {FOCUS_LIST.filter((view) => view.scene === scene).map((view) => (
        <FocusTarget key={view.id} view={view} />
      ))}
    </>
  )
}
